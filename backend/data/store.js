// backend/data/store.js
// Lectura y escritura de los JSON de datos (AppData\Roaming\Revdyne). TODO pasa por aquí.
//
// - Escritura segura: se escribe a `<archivo>.tmp` (con fsync) y se renombra encima del original, así un cierre o un corte de luz a
//   mitad de escritura nunca deja el archivo cortado. Antes de reemplazarlo, la versión anterior se copia a `<archivo>.bak`.
// - Recuperación: si un archivo está vacío o no es JSON válido, se aparta como `<archivo>.corrupt-<fecha>` (no se pierde), se carga
//   el `.bak` y se avisa (log + aviso en la interfaz vía takeDataIssues). Antes se devolvían los valores por defecto en silencio y el
//   siguiente guardado borraba los datos del usuario.
// - Caché en memoria: cada lectura solo hace un stat; si el archivo no cambió (mtime/tamaño) se devuelve una COPIA de lo ya leído.
//   Si alguien lo edita a mano, el cambio de mtime obliga a releerlo.
// - Migraciones: al leer del disco se pasa el dato al formato actual (backend/data/migrations.js) y se guarda migrado.
const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const { DEFAULT_SETTINGS, EMPTY_PROFILES, EMPTY_CATALOG, EMPTY_STICKERS, DEFAULT_OVERLAYS } = require('./defaults');
const { migrate } = require('./migrations');

// Archivos con migraciones de formato (clave de MIGRATIONS en migrations.js)
const MIGRATED_KINDS = { [paths.PROFILES_FILE]: 'profiles' };

// El logger usa store (config) indirectamente: se carga perezoso para no crear un ciclo de require
const log = (level, msg, data) => { try { require('../services/logger')[level]('datos', msg, data); } catch { /* sin logger: solo consola */ } };

const cache = new Map(); // filePath -> { mtimeMs, size, data }
const issues = []; // avisos pendientes para la interfaz: { file, action, backup }
let issueListener = null; // server.js lo usa para avisar al panel en cuanto ocurre
const addIssue = (issue) => { issues.push(issue); try { issueListener?.(); } catch { /* el aviso no debe romper la lectura */ } };

const clone = (v) => (v === undefined ? v : structuredClone(v));
function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) deepFreeze(v[k]); }
  return v;
}
const label = (filePath) => path.basename(filePath);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Renombrar puede fallar un instante en Windows si un antivirus o el indexador tienen el archivo abierto: se reintenta
function renameWithRetry(from, to) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return; }
    catch (e) {
      if (i >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      sleepSync(30 * (i + 1));
    }
  }
}

function parseFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.trim() === '') throw new Error('archivo vacío');
  return JSON.parse(raw);
}

function remember(filePath, data) {
  try {
    const st = fs.statSync(filePath);
    cache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, data: deepFreeze(clone(data)) });
  } catch { cache.delete(filePath); }
}

// Solo se conservan los últimos archivos dañados apartados de cada tipo (el nombre lleva la fecha, así que ordenar por nombre = por fecha)
const MAX_CORRUPT_COPIES = 5;
function pruneCorrupt(filePath) {
  try {
    const dir = path.dirname(filePath);
    const prefix = `${label(filePath)}.corrupt-`;
    const old = fs.readdirSync(dir).filter(f => f.startsWith(prefix)).sort().slice(0, -MAX_CORRUPT_COPIES);
    for (const f of old) fs.unlinkSync(path.join(dir, f));
  } catch { /* limpiar es opcional */ }
}

// Archivo dañado: se aparta (para poder revisarlo) y se intenta el .bak
function recover(filePath, error, defaultData) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const corruptPath = `${filePath}.corrupt-${stamp}`;
  try { renameWithRetry(filePath, corruptPath); } catch { /* si no se puede mover, se sobrescribirá al restaurar */ }
  pruneCorrupt(filePath);

  const bakPath = `${filePath}.bak`;
  try {
    const data = parseFile(bakPath);
    writeJSON(filePath, data, { backup: false });
    console.error(`⚠️ ${label(filePath)} estaba dañado (${error.message}); se recuperó la copia de seguridad.`);
    log('error', `${label(filePath)} estaba dañado: se recuperó la copia de seguridad`, { error: error.message, apartado: label(corruptPath) });
    addIssue({ file: label(filePath), action: 'restored', backup: label(corruptPath) });
    return data;
  } catch (bakError) {
    console.error(`❌ ${label(filePath)} estaba dañado y no hay copia de seguridad válida (${bakError.message}).`);
    log('error', `${label(filePath)} estaba dañado y no hay copia de seguridad válida: se usan los valores por defecto`, { error: error.message, copia: bakError.message, apartado: label(corruptPath) });
    addIssue({ file: label(filePath), action: 'reset', backup: label(corruptPath) });
    writeJSON(filePath, defaultData, { backup: false });
    return clone(defaultData);
  }
}

// Pasa el dato al formato actual y, si cambió, lo guarda (dejando antes una copia de la versión vieja, una sola vez)
function applyMigrations(filePath, data) {
  const kind = MIGRATED_KINDS[filePath];
  if (!kind) return data;
  let result;
  try { result = migrate(kind, data); }
  catch (e) {
    log('error', `No se pudo migrar ${label(filePath)}`, { error: e.message });
    return data; // mejor seguir con el formato viejo que perder datos
  }
  if (!result.changed) return data;
  const versionBak = `${filePath}.v${result.from}.bak`;
  try { if (!fs.existsSync(versionBak)) fs.copyFileSync(filePath, versionBak); } catch { /* sin copia: se migra igual */ }
  writeJSON(filePath, result.data, { backup: false });
  console.log(`🔄 ${label(filePath)} actualizado del formato v${result.from} al v${result.to}`);
  log('info', `${label(filePath)} actualizado de formato`, { de: result.from, a: result.to, copia: label(versionBak) });
  return result.data;
}

// Objeto de la caché, CONGELADO y compartido (sin copiar). Solo para lecturas frecuentes que no modifican nada (eventEngine en cada
// regalo/like); quien vaya a cambiar datos usa readJSON/load*, que devuelven una copia.
function peekJSON(filePath, defaultData) {
  let st;
  try { st = fs.statSync(filePath); }
  catch { return deepFreeze(clone(defaultData)); } // aún no existe: valores por defecto (bootstrap lo crea al arrancar)

  const hit = cache.get(filePath);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.data;

  let data;
  try { data = parseFile(filePath); }
  catch (e) { data = recover(filePath, e, defaultData); }
  data = applyMigrations(filePath, data);
  remember(filePath, data);
  return cache.get(filePath)?.data ?? deepFreeze(data);
}

function readJSON(filePath, defaultData) {
  return clone(peekJSON(filePath, defaultData));
}

function writeJSON(filePath, data, { backup = true } = {}) {
  const tmpPath = `${filePath}.tmp`;
  try {
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeSync(fd, JSON.stringify(data, null, 2));
      fs.fsyncSync(fd); // que esté en disco antes de reemplazar el original
    } finally {
      fs.closeSync(fd);
    }
    if (backup && fs.existsSync(filePath)) {
      try { fs.copyFileSync(filePath, `${filePath}.bak`); } catch { /* sin copia esta vez: no impide guardar */ }
    }
    renameWithRetry(tmpPath, filePath);
    remember(filePath, data);
    return true;
  } catch (e) {
    console.error(`❌ Error guardando ${filePath}:`, e.message);
    log('error', `No se pudo guardar ${label(filePath)}`, { error: e.message, codigo: e.code });
    try { fs.unlinkSync(tmpPath); } catch { /* no quedó temporal */ }
    return false;
  }
}

// Avisos de archivos recuperados, para mostrarlos una vez en la interfaz
function takeDataIssues() {
  return issues.splice(0, issues.length);
}
function onDataIssue(fn) {
  issueListener = fn;
}

// --- Settings (config.json) ---
function loadSettings() {
  return readJSON(paths.CONFIG_FILE, DEFAULT_SETTINGS);
}
function saveSettings(settings) {
  writeJSON(paths.CONFIG_FILE, settings);
}

// --- Catálogo de regalos (catalog.json) ---
function loadCatalog() {
  return readJSON(paths.CATALOG_FILE, EMPTY_CATALOG);
}
function saveCatalog(catalog) {
  writeJSON(paths.CATALOG_FILE, catalog);
}

// --- Catálogo de stickers (stickers.json) ---
function loadStickers() {
  return readJSON(paths.STICKERS_FILE, EMPTY_STICKERS);
}
function saveStickers(stickers) {
  writeJSON(paths.STICKERS_FILE, stickers);
}

// --- Overlays (overlays.json) ---
function loadOverlays() {
  return readJSON(paths.OVERLAYS_FILE, DEFAULT_OVERLAYS);
}
function saveOverlays(overlays) {
  writeJSON(paths.OVERLAYS_FILE, overlays);
}

// --- Tops del día (rankings.json) ---
function loadRankings() {
  return readJSON(paths.RANKINGS_FILE, {});
}
function saveRankings(data) {
  writeJSON(paths.RANKINGS_FILE, data);
}

// --- Última sala (lastRoom.json): { roomId, username, idioma, at } ---
function loadLastRoom() {
  return readJSON(paths.LAST_ROOM_FILE, null);
}
function saveLastRoom(room) {
  writeJSON(paths.LAST_ROOM_FILE, room);
}

// --- Perfiles (profiles.json) ---
// Ya NO migra aquí. bootstrap.js garantiza que el archivo existe
// antes de que loadProfiles() se llame por primera vez.
function loadProfiles() {
  return readJSON(paths.PROFILES_FILE, EMPTY_PROFILES);
}
// Solo lectura (congelado, sin copia): para la ruta caliente de los eventos
function peekProfiles() {
  return peekJSON(paths.PROFILES_FILE, EMPTY_PROFILES);
}
function saveProfiles(profiles) {
  writeJSON(paths.PROFILES_FILE, profiles);
}

// --- Juegos soportados (games.json) ---
// Dato de la APP, no de usuario: viene empaquetado, nunca se escribe
// en runtime. Por eso no pasa por paths.js ni por readJSON/userData.
function loadGames() {
  // Copia defensiva: require() cachea el mismo objeto en toda la app,
  // si alguien lo mutara sin querer se corrompería para todos los callers.
  return structuredClone(require('./games.json'));
}

module.exports = {
  readJSON, writeJSON, takeDataIssues, onDataIssue,
  loadSettings, saveSettings,
  loadCatalog, saveCatalog,
  loadStickers, saveStickers,
  loadProfiles, peekProfiles, saveProfiles,
  loadOverlays, saveOverlays, loadRankings, saveRankings, loadLastRoom, saveLastRoom,
  loadGames,
};
