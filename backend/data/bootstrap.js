// backend/data/bootstrap.js
const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const { DEFAULT_SETTINGS, EMPTY_PROFILES, EMPTY_CATALOG, EMPTY_STICKERS, DEFAULT_OVERLAYS } = require('./defaults');

const { writeJSON } = require('./store'); // escritura segura (temporal + renombrar)

function createIfMissing(filePath, defaultData, label) {
  if (!fs.existsSync(filePath)) {
    console.log(`🆕 [BOOTSTRAP] Creando ${label}...`);
    writeJSON(filePath, defaultData);
  }
}

// Los sonidos vivían en Documentos\REVDYNE\sounds: se mueven a AppData (paths.SOUNDS_DIR). Si Windows no deja borrarlos de
// Documentos (acceso controlado a carpetas), se copian y el original se queda. Solo en Electron: en "npm run dev" ROOT_DIR es la
// carpeta del proyecto y no hay que arrastrar ahí los sonidos reales del usuario.
function migrateSoundsFolder() {
  if (!paths.IS_ELECTRON || !fs.existsSync(paths.LEGACY_SOUNDS_DIR)) return;
  const logger = require('../services/logger');
  let moved = 0, copied = 0, skipped = 0, failed = 0;
  for (const name of fs.readdirSync(paths.LEGACY_SOUNDS_DIR)) {
    const from = path.join(paths.LEGACY_SOUNDS_DIR, name);
    const to = path.join(paths.SOUNDS_DIR, name);
    try {
      if (!fs.statSync(from).isFile()) continue;
      if (fs.existsSync(to)) { skipped++; continue; }
      try { fs.renameSync(from, to); moved++; }
      catch { fs.copyFileSync(from, to); copied++; } // otra unidad, o Documentos protegido: se copia
    } catch { failed++; }
  }
  // Si quedó vacía, se quita la carpeta vieja (y REVDYNE si no tiene nada más)
  for (const dir of [paths.LEGACY_SOUNDS_DIR, path.dirname(paths.LEGACY_SOUNDS_DIR)]) {
    try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch { /* se queda */ }
  }
  if (moved || copied || failed) {
    console.log(`🎵 Sonidos movidos a ${paths.SOUNDS_DIR}: ${moved} movidos, ${copied} copiados, ${skipped} ya estaban, ${failed} con error`);
    logger.info('datos', 'Sonidos movidos de Documentos a AppData', { movidos: moved, copiados: copied, yaEstaban: skipped, errores: failed, destino: paths.SOUNDS_DIR });
  }
}

// Decisiones revisadas sobre IDs de regalos (giftOverrides.json) aplicadas al catálogo ya guardado
function applyGiftOverrides() {
  const store = require('./store');
  const catalog = store.loadCatalog();
  if (require('./giftOverrides').applyOverrides(catalog)) store.saveCatalog(catalog);
}

function ensureFirstRun() {
  try { migrateSoundsFolder(); } catch (e) { console.error('⚠️ No se pudieron mover los sonidos:', e.message); }
  createIfMissing(paths.CONFIG_FILE, DEFAULT_SETTINGS, 'config.json');
  createIfMissing(paths.CATALOG_FILE, EMPTY_CATALOG, 'catalog.json');
  createIfMissing(paths.STICKERS_FILE, EMPTY_STICKERS, 'stickers.json');
  createIfMissing(paths.PROFILES_FILE, EMPTY_PROFILES, 'profiles.json');
  createIfMissing(paths.OVERLAYS_FILE, DEFAULT_OVERLAYS, 'overlays.json');
  try { applyGiftOverrides(); } catch (e) { console.error('⚠️ No se pudieron aplicar las decisiones de regalos:', e.message); }
}

module.exports = { ensureFirstRun };