// backend/data/store.js
const fs = require('fs');
const paths = require('../paths');
const { DEFAULT_SETTINGS, EMPTY_PROFILES, EMPTY_CATALOG, EMPTY_STICKERS, DEFAULT_OVERLAYS } = require('./defaults');

function readJSON(filePath, defaultData) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (raw.trim() !== '') return JSON.parse(raw);
    }
  } catch (e) {
    console.error(`⚠️ Error leyendo ${filePath}:`, e.message);
  }
  return defaultData;
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`❌ Error guardando ${filePath}:`, e.message);
  }
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

// --- Perfiles (profiles.json) ---
// Ya NO migra aquí. bootstrap.js garantiza que el archivo existe
// antes de que loadProfiles() se llame por primera vez.
function loadProfiles() {
  return readJSON(paths.PROFILES_FILE, EMPTY_PROFILES);
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
  loadSettings, saveSettings,
  loadCatalog, saveCatalog,
  loadStickers, saveStickers,
  loadProfiles, saveProfiles,
  loadOverlays, saveOverlays,
  loadGames,
};