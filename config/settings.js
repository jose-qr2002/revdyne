const fs = require('fs');
const path = require('path');

let ROOT_DIR = process.cwd();

if (process.versions && process.versions.electron) {
  // PRODUCCIÓN (Electron)
  const { app } = require('electron');
  ROOT_DIR = app.getPath('userData'); 
} else {
  // DESARROLLO (Node.js puro)
  ROOT_DIR = process.cwd();
}

const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const CATALOG_FILE = path.join(ROOT_DIR, 'catalog.json');
const PROFILES_FILE = path.join(ROOT_DIR, 'profiles.json');

// Archivos viejos (Solo para leerlos y migrarlos la primera vez)
const ACTIONS_FILE = path.join(ROOT_DIR, 'actions.json');
const EVENTS_FILE = path.join(ROOT_DIR, 'events.json');

function readJSON(filePath, defaultData) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      if (data.trim() !== '') return JSON.parse(data);
    }
  } catch (e) { 
    console.error(`⚠️ Error leyendo ${path.basename(filePath)}:`, e.message); 
  }
  return defaultData;
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`❌ Error guardando ${path.basename(filePath)}:`, e.message);
  }
}

function loadConfig() {
  const baseConfig = readJSON(CONFIG_FILE, {
    username: '', keyDelayMs: 80, tts: { enabled: true }
  });
  
  const catalog = readJSON(CATALOG_FILE, {});

  // 🌟 LÓGICA DE PERFILES Y MIGRACIÓN
  let profilesData = readJSON(PROFILES_FILE, null);

  if (!profilesData) {
    console.log("🔄 Iniciando migración a Sistema de Perfiles...");
    // Si no existe profiles.json, rescatamos los datos viejos
    const oldActions = readJSON(ACTIONS_FILE, {});
    const oldEvents = readJSON(EVENTS_FILE, []);

    profilesData = {
      activeProfileId: 'prof_default',
      list: {
        prof_global: {
          name: '🌐 Comandos Globales (Audios/Stickers)',
          isGlobal: true, // Identificador especial
          actions: {},
          events: []
        },
        prof_default: {
          name: '🎮 Mi Primer Juego',
          actions: oldActions, // Metemos tus acciones actuales aquí
          events: oldEvents    // Metemos tus eventos actuales aquí
        }
      }
    };
    // Guardamos el nuevo archivo maestro y ya no volverá a entrar aquí
    writeJSON(PROFILES_FILE, profilesData);
    console.log("✅ Migración completada. Datos guardados en profiles.json");
  }

  // Obtenemos las acciones del perfil activo para no romper tu UI vieja ("El Espejismo")
  const activeProfile = profilesData.list[profilesData.activeProfileId] || profilesData.list['prof_default'];
  const activeActions = activeProfile.actions || {};
  
  const legacyGiftMappings = {};

  Object.keys(catalog).forEach(id => {
    legacyGiftMappings[id] = {
      name: catalog[id].name,
      coins: catalog[id].coins,
      icon: catalog[id].icon,
      key: '',          
      modifier: 'none', 
      enabled: true
    };
  });

  Object.keys(activeActions).forEach(id => {
    if (legacyGiftMappings[id]) {
      legacyGiftMappings[id].key = activeActions[id].key || '';
      legacyGiftMappings[id].modifier = activeActions[id].modifier || 'none';
      legacyGiftMappings[id].enabled = activeActions[id].enabled !== false;
    } else {
      legacyGiftMappings[id] = activeActions[id];
    }
  });

  return {
    ...baseConfig,
    catalog,
    profiles: profilesData, // 🌟 Pasamos todos los perfiles al frontend
    giftMappings: legacyGiftMappings 
  };
}

function saveConfig(config) {
  const { catalog, profiles, giftMappings, ...generalConfig } = config;

  writeJSON(CONFIG_FILE, generalConfig);
  writeJSON(CATALOG_FILE, catalog || {});
  
  // 🌟 Solo guardamos el nuevo archivo maestro de perfiles
  if (profiles) {
    writeJSON(PROFILES_FILE, profiles);
  }
}

module.exports = { loadConfig, saveConfig };