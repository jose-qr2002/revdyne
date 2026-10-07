// backend/data/bootstrap.js
const fs = require('fs');
const paths = require('../paths');
const { DEFAULT_SETTINGS, EMPTY_PROFILES, EMPTY_CATALOG, EMPTY_STICKERS, DEFAULT_OVERLAYS } = require('./defaults');

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function createIfMissing(filePath, defaultData, label) {
  if (!fs.existsSync(filePath)) {
    console.log(`🆕 [BOOTSTRAP] Creando ${label}...`);
    writeJSON(filePath, defaultData);
  }
}

function ensureFirstRun() {
  createIfMissing(paths.CONFIG_FILE, DEFAULT_SETTINGS, 'config.json');
  createIfMissing(paths.CATALOG_FILE, EMPTY_CATALOG, 'catalog.json');
  createIfMissing(paths.STICKERS_FILE, EMPTY_STICKERS, 'stickers.json');
  createIfMissing(paths.PROFILES_FILE, EMPTY_PROFILES, 'profiles.json');
  createIfMissing(paths.OVERLAYS_FILE, DEFAULT_OVERLAYS, 'overlays.json');
}

module.exports = { ensureFirstRun };