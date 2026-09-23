// backend/data/migrations/001-actions-events-to-profiles.js
const fs = require('fs');
const paths = require('../../paths');

function readJSON(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (raw.trim() !== '') return JSON.parse(raw);
    }
  } catch (e) {
    console.error(`⚠️ Error leyendo ${filePath} durante migración:`, e.message);
  }
  return fallback;
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Devuelve true si migró algo, false si no había nada que migrar
// (esto último es el caso normal en una PC nueva).
function migrateLegacyIfPresent() {
  const hayViejo = fs.existsSync(paths.LEGACY_ACTIONS_FILE) || fs.existsSync(paths.LEGACY_EVENTS_FILE);
  if (!hayViejo) return false;

  console.log('🔄 [MIGRACIÓN] Encontrados actions.json/events.json viejos, migrando...');

  const oldActions = readJSON(paths.LEGACY_ACTIONS_FILE, {});
  const oldEvents = readJSON(paths.LEGACY_EVENTS_FILE, []);

  const profilesData = {
    schemaVersion: 1,
    activeProfileId: 'prof_default',
    list: {
      prof_global: {
        name: '🌐 Comandos Globales (Audios/Stickers)',
        isGlobal: true,
        actions: {},
        events: []
      },
      prof_default: {
        name: '🎮 Mi Primer Juego',
        game: 'generic_keyboard',
        actions: oldActions,
        events: oldEvents
      }
    }
  };

  writeJSON(paths.PROFILES_FILE, profilesData);
  console.log('✅ [MIGRACIÓN] profiles.json creado a partir de datos antiguos.');
  return true;
}

module.exports = { migrateLegacyIfPresent };