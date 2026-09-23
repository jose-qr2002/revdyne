// backend/data/bootstrap.js
const fs = require('fs');
const paths = require('../paths');
const { migrateLegacyIfPresent } = require('./migrations/001-actions-events-to-profiles');
const { migrateStickerAssignmentsIfPresent } = require('./migrations/002-stickers-assignments-to-events');

const { DEFAULT_SETTINGS, EMPTY_CATALOG, EMPTY_PROFILES, EMPTY_STICKERS } = require('./defaults')

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
  // config.json: siempre con valores por defecto si no existe
  createIfMissing(paths.CONFIG_FILE, DEFAULT_SETTINGS, 'config.json');

  // catalog.json: vacío, se llena al sincronizar regalos
  createIfMissing(paths.CATALOG_FILE, EMPTY_CATALOG, 'catalog.json');

  // stickers.json: vacío, solo catálogo (sin assignments)
  createIfMissing(paths.STICKERS_FILE, EMPTY_STICKERS, 'stickers.json');

  // profiles.json: si hay datos viejos (actions.json/events.json) los migra;
  // si no hay nada, crea el esqueleto vacío con prof_global.
  if (!fs.existsSync(paths.PROFILES_FILE)) {
    const seMigroAlgo = migrateLegacyIfPresent();
    if (!seMigroAlgo) {
      console.log('🆕 [BOOTSTRAP] Creando profiles.json vacío...');
      writeJSON(paths.PROFILES_FILE, EMPTY_PROFILES);
    }
  }

  migrateStickerAssignmentsIfPresent();

  // games.json NO se crea aquí a propósito: no es dato de usuario,
  // viaja empaquetado en backend/data/games.json (se sube a git).
}

module.exports = { ensureFirstRun };