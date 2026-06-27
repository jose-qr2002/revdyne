const fs = require('fs');
const path = require('path');

let ROOT_DIR = process.cwd();

if (process.versions && process.versions.electron) {
  // PRODUCCIÓN (Electron): Guarda en C:\Users\Usuario\AppData\Roaming\NombreDeTuApp
  const { app } = require('electron');
  ROOT_DIR = app.getPath('userData'); 
} else {
  // DESARROLLO (Node.js puro): Guarda en la carpeta de tu código
  ROOT_DIR = process.cwd();
}

const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const CATALOG_FILE = path.join(ROOT_DIR, 'catalog.json');
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
  const actions = readJSON(ACTIONS_FILE, {});
  const events = readJSON(EVENTS_FILE, []);

  // 🪄 EL ESPEJISMO: Creamos un objeto falso para que la UI vieja funcione
  const legacyGiftMappings = {};

  // 1. Recorremos el catálogo y lo metemos en el formato viejo
  Object.keys(catalog).forEach(id => {
    legacyGiftMappings[id] = {
      name: catalog[id].name,
      coins: catalog[id].coins,
      icon: catalog[id].icon,
      key: '',          // Por defecto vacío
      modifier: 'none', // Por defecto vacío
      enabled: true
    };
  });

  // 2. Si ya tenías teclas configuradas en 'actions', se las pegamos encima
  Object.keys(actions).forEach(id => {
    if (legacyGiftMappings[id]) {
      legacyGiftMappings[id].key = actions[id].key || '';
      legacyGiftMappings[id].modifier = actions[id].modifier || 'none';
      legacyGiftMappings[id].enabled = actions[id].enabled !== false;
    } else {
      // Para los eventos falsos como action_follow o action_like
      legacyGiftMappings[id] = actions[id];
    }
  });

  // Entregamos todo al servidor
  return {
    ...baseConfig,
    catalog,
    actions,
    events,
    // Le pasamos el espejismo al frontend
    giftMappings: legacyGiftMappings 
  };
}

function saveConfig(config) {
  const { catalog, actions, events, ...generalConfig } = config;

  writeJSON(CONFIG_FILE, generalConfig);
  writeJSON(CATALOG_FILE, catalog || {});
  writeJSON(ACTIONS_FILE, actions || {});
  writeJSON(EVENTS_FILE, events || []);
}

module.exports = { loadConfig, saveConfig };