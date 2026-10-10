// backend/services/videoService.js
// Pantallas de video para OBS / TikTok LIVE Studio: 9 pantallas (cada una es un enlace distinto que se añade como fuente) donde
// las acciones de tipo "video" reproducen un video. El usuario elige en qué pantalla va cada acción y copia el enlace de esa pantalla.
//
// Los videos se suben a la carpeta `videos` de AppData (paths.VIDEOS_DIR, nunca a Documentos) y se sirven en /videos.
// Cada página de pantalla (backend/overlays/screen.html) se une a la sala `overlay:video:<n>` y recibe `overlay:video:<n>:play`.
// Los ajustes de cada pantalla (ajuste del video y qué hacer si llega otro mientras suena uno) viven en overlays.json, clave `video`.
const fs = require('fs');
const path = require('path');
const store = require('../data/store');
const paths = require('../paths');
const logger = require('./logger');
const { DEFAULT_OVERLAYS, VIDEO_OPTIONS } = require('../data/defaults');

const KIND = 'video';
const SCREENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const VIDEO_EXTENSIONS = ['.mp4', '.webm'];

let io = null;

// ---------- Config ----------
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

function sanitize(input, current) {
  const d = DEFAULT_OVERLAYS[KIND];
  const screens = {};
  for (const n of SCREENS) {
    const m = { ...(current?.screens?.[n] || d.screens[n]), ...(input?.screens?.[n] || {}) };
    screens[n] = { fit: oneOf(m.fit, VIDEO_OPTIONS.fits, d.screens[n].fit), onBusy: oneOf(m.onBusy, VIDEO_OPTIONS.onBusy, d.screens[n].onBusy) };
  }
  return { screens };
}

let cache = null;
function getConfig() {
  if (!cache) cache = sanitize({}, store.loadOverlays()[KIND] || {});
  return cache;
}

function updateScreen(n, patch) {
  if (!SCREENS.includes(n)) return getConfig();
  cache = sanitize({ screens: { [n]: patch } }, getConfig());
  store.saveOverlays({ ...store.loadOverlays(), schemaVersion: 1, [KIND]: cache });
  io?.to(room(n)).to(previewRoom(n)).emit(`overlay:${KIND}:${n}:state`, screenState(n));
  return cache;
}

const screenState = (n) => ({ screen: n, ...getConfig().screens[n] });

// ---------- Salas ----------
const room = (n) => `overlay:${KIND}:${n}`;
const previewRoom = (n) => `overlay-preview:${KIND}:${n}`;
const clientCount = (n) => io?.sockets.adapter.rooms.get(room(n))?.size || 0;
const counts = () => Object.fromEntries(SCREENS.map(n => [n, clientCount(n)]));

// ---------- Videos ----------
// Nombre de archivo válido dentro de VIDEOS_DIR (sin rutas) y que existe
function resolveVideo(file) {
  if (typeof file !== 'string' || !/^[\w.\- ]{1,150}$/.test(file) || file.includes('..')) return null;
  if (!VIDEO_EXTENSIONS.includes(path.extname(file).toLowerCase())) return null;
  const full = path.join(paths.VIDEOS_DIR, file);
  return fs.existsSync(full) ? file : null;
}

function listVideos() {
  try {
    return fs.readdirSync(paths.VIDEOS_DIR)
      .filter(f => VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .map(f => { const st = fs.statSync(path.join(paths.VIDEOS_DIR, f)); return { name: f, size: st.size, mtime: st.mtimeMs }; })
      .sort((a, b) => b.mtime - a.mtime);
  } catch { return []; }
}

// Reproduce un video en una pantalla (lo usa la acción "video" y el botón de probar)
function play(screen, { file, volume = 100 } = {}) {
  const n = parseInt(screen, 10);
  if (!SCREENS.includes(n)) return { executed: false };
  const name = resolveVideo(file);
  if (!name) {
    logger.warn('acciones', 'El video de la acción no existe en la biblioteca', { video: String(file).slice(0, 80), pantalla: n });
    return { executed: false };
  }
  const vol = Math.min(1, Math.max(0, (Number(volume) || 0) / 100));
  const payload = { file: name, url: `/videos/${encodeURIComponent(name)}`, volume: vol };
  io?.to(room(n)).to(previewRoom(n)).emit(`overlay:${KIND}:${n}:play`, payload);
  const linked = clientCount(n) > 0;
  return { executed: true, label: `Video P${n}${linked ? '' : ' (sin enlazar)'}` };
}

function stop(screen) {
  const n = parseInt(screen, 10);
  if (SCREENS.includes(n)) io?.to(room(n)).to(previewRoom(n)).emit(`overlay:${KIND}:${n}:stop`);
}

function deleteVideo(file) {
  const name = resolveVideo(file);
  if (!name) return false;
  fs.unlinkSync(path.join(paths.VIDEOS_DIR, name));
  return true;
}

// ---------- Sockets ----------
function init(ioInstance) {
  io = ioInstance;
  const last = {};
  const broadcast = () => {
    io.emit(`overlay:${KIND}:clients`, counts());
    for (const n of SCREENS) {
      const c = clientCount(n);
      if ((last[n] || 0) !== c) {
        logger.info('overlay', `Pantalla de video ${n}: ${(last[n] || 0) === 0 ? 'enlazada' : c === 0 ? 'sin enlace (se desconectó)' : `${c} conexiones`}`, { conexiones: c });
        last[n] = c;
      }
    }
  };
  io.on('connection', (socket) => {
    socket.on('overlay:join', ({ name, screen, preview } = {}) => {
      if (name !== KIND) return;
      const n = parseInt(screen, 10);
      if (!SCREENS.includes(n)) return;
      socket.join(preview ? previewRoom(n) : room(n));
      if (!preview) broadcast();
      socket.emit(`overlay:${KIND}:${n}:state`, screenState(n));
    });
    socket.on('overlay:error', ({ name, screen, reason, file } = {}) => {
      if (name !== KIND) return;
      logger.warn('overlay', `Pantalla ${parseInt(screen, 10) || '?'}: no se pudo reproducir el video`, { motivo: String(reason).slice(0, 80), archivo: String(file).slice(0, 80) });
    });
    socket.on('disconnect', broadcast);
    socket.emit(`overlay:${KIND}:clients`, counts());
  });
}

module.exports = {
  init, KIND, SCREENS, VIDEO_EXTENSIONS,
  getConfig, updateScreen, counts, clientCount,
  play, stop, listVideos, deleteVideo, resolveVideo,
  options: VIDEO_OPTIONS,
};
