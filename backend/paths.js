// backend/paths.js
const path = require('path');
const os = require('os');
const fs = require('fs');

const isElectron = !!(process.versions && process.versions.electron);

// Carpeta oculta de la app: donde viven los .json de configuración.
// En Electron empaquetado, Windows la resuelve como algo tipo
// C:\Users\tuUsuario\AppData\Roaming\REVDYNE
const ROOT_DIR = isElectron
  ? require('electron').app.getPath('userData')
  : process.cwd();

// Carpeta visible para el usuario: aquí es donde arrastra sus mp3 a mano.
// A propósito NO va dentro de ROOT_DIR, porque el usuario sí debe poder
// verla y tocarla sin bucear en AppData.
const TTS_ENGINES_DIR = path.join(ROOT_DIR, 'tts-engines');
const SOUNDS_DIR = path.join(os.homedir(), 'Documents', 'REVDYNE', 'sounds');
// PIPER TTS
const PIPER_DIR = path.join(__dirname, 'bin', 'piper');
const PIPER_EXECUTABLE = path.join(PIPER_DIR, process.platform === 'win32' ? 'piper.exe' : 'piper');
const PIPER_VOICES_DIR = path.join(PIPER_DIR, 'voices');


function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function engineRootDir(engineId) {
  return path.join(TTS_ENGINES_DIR, engineId);
}

ensureDir(ROOT_DIR);
ensureDir(SOUNDS_DIR);

module.exports = {
  ROOT_DIR,
  SOUNDS_DIR,
  PIPER_EXECUTABLE,
  PIPER_VOICES_DIR,
  TTS_ENGINES_DIR,
  engineRootDir,

  CONFIG_FILE: path.join(ROOT_DIR, 'config.json'),
  CATALOG_FILE: path.join(ROOT_DIR, 'catalog.json'),
  PROFILES_FILE: path.join(ROOT_DIR, 'profiles.json'),
  STICKERS_FILE: path.join(ROOT_DIR, 'stickers.json'),
};