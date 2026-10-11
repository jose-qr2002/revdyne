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

const TTS_ENGINES_DIR = path.join(ROOT_DIR, 'tts-engines');
// Registro de avisos y errores (revdyne.log + rotados). En AppData, igual que el resto de datos.
const LOGS_DIR = path.join(ROOT_DIR, 'logs');
// Sonidos de las acciones. En AppData como el resto: escribir en Documentos lo bloquea el "acceso controlado a carpetas" de Windows.
// Para añadirlos a mano, el panel tiene "Abrir carpeta" (POST /api/sounds/open-folder).
const SOUNDS_DIR = path.join(ROOT_DIR, 'sounds');
// Ubicación anterior (hasta 1.0.0-beta.13): bootstrap.migrateSoundsFolder mueve lo que haya aquí a SOUNDS_DIR. No se crea.
const LEGACY_SOUNDS_DIR = path.join(os.homedir(), 'Documents', 'REVDYNE', 'sounds');
// PIPER TTS
const PIPER_DIR = path.join(__dirname, 'bin', 'piper');
const PIPER_EXECUTABLE = path.join(PIPER_DIR, process.platform === 'win32' ? 'piper.exe' : 'piper');
const PIPER_VOICES_DIR = path.join(PIPER_DIR, 'voices');
const LICENSE_FILE = path.join(ROOT_DIR, 'license.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function engineRootDir(engineId) {
  return path.join(TTS_ENGINES_DIR, engineId);
}

ensureDir(ROOT_DIR);
ensureDir(SOUNDS_DIR);
const MEDIA_DIR = path.join(ROOT_DIR, 'media'); // imágenes, GIF y videos de fondo de los overlays (servidos en /media)
ensureDir(MEDIA_DIR);
const VIDEOS_DIR = path.join(ROOT_DIR, 'videos'); // biblioteca de videos de las pantallas de video (servidos en /videos). En AppData, nunca en Documentos
ensureDir(VIDEOS_DIR);
ensureDir(LOGS_DIR);

module.exports = {
  IS_ELECTRON: isElectron,
  ROOT_DIR,
  SOUNDS_DIR,
  LEGACY_SOUNDS_DIR,
  MEDIA_DIR,
  VIDEOS_DIR,
  PIPER_EXECUTABLE,
  PIPER_VOICES_DIR,
  TTS_ENGINES_DIR,
  LOGS_DIR,
  LOG_FILE: path.join(LOGS_DIR, 'revdyne.log'),
  LICENSE_FILE,
  engineRootDir,

  CONFIG_FILE: path.join(ROOT_DIR, 'config.json'),
  CATALOG_FILE: path.join(ROOT_DIR, 'catalog.json'),
  PROFILES_FILE: path.join(ROOT_DIR, 'profiles.json'),
  STICKERS_FILE: path.join(ROOT_DIR, 'stickers.json'),
  OVERLAYS_FILE: path.join(ROOT_DIR, 'overlays.json'),
  LAST_ROOM_FILE: path.join(ROOT_DIR, 'lastRoom.json'), // última sala a la que se conectó la app (para actualizar sus regalos)
  GIFT_SYNC_LOG_FILE: path.join(ROOT_DIR, 'giftSyncLog.json'), // historial (temporal) de obtenciones de regalos: qué trajo cada descarga
  RANKINGS_FILE: path.join(ROOT_DIR, 'rankings.json'), // tops "del día" (se conservan al cerrar la app)
};