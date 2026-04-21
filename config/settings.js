const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) { console.error('Error leyendo config:', e.message); }
  
  return {
    username: '',
    giftMappings: {},
    globalKey: '',
    useGlobalKey: false,
    minCoins: 0,
    cooldownMs: 0,
    keyDelayMs: 80,
    debug: false,
    tts: {
      enabled: false,
      onlyFanClub: true,
      includeMods: true,
      sayUsername: true,
      engine: 'browser',
      elevenLabsKey: '',
      elevenLabsVoiceId: '',
      browserVoiceName: '',
      audioDeviceId: '',
      maxQueue: 10,
      maxChars: 150
    }
  };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

module.exports = { loadConfig, saveConfig };