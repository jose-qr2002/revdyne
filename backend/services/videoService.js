// backend/services/videoService.js
// Pantallas para OBS / TikTok LIVE Studio: 9 pantallas (cada una es un enlace distinto que se añade como fuente) donde las acciones de
// tipo "video" e "imagen" (también GIF) muestran su contenido. El usuario elige en qué pantalla va cada paso y copia el enlace de esa pantalla.
// (Se llama videoService y la sala `overlay:video:<n>` por historia: las pantallas nacieron solo para videos.)
//
// Los videos van a la carpeta `videos` de AppData (paths.VIDEOS_DIR) y se sirven en /videos; las imágenes y GIF a `images` (paths.IMAGES_DIR,
// en /images). Nunca a Documentos. Videos e imágenes comparten la MISMA cola de cada pantalla.
// Cada página de pantalla (backend/overlays/screen.html) se une a la sala `overlay:video:<n>` y recibe `overlay:video:<n>:play` con
// { kind: 'video' | 'image', file, url, volume (video) | durationMs (imagen) }.
// Los ajustes de cada pantalla (ajuste dentro del recuadro y qué hacer si llega otro contenido mientras hay uno) viven en overlays.json, clave `video`.
const fs = require('fs');
const path = require('path');
const store = require('../data/store');
const paths = require('../paths');
const logger = require('./logger');
const { DEFAULT_OVERLAYS, VIDEO_OPTIONS } = require('../data/defaults');

const KIND = 'video';
const SCREENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const VIDEO_EXTENSIONS = ['.mp4', '.webm'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const IMAGE_MIN_SECONDS = 1;
const IMAGE_MAX_SECONDS = 60;
const IMAGE_DEFAULT_SECONDS = 5;

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

// ---------- Archivos de las bibliotecas ----------
// Nombre de archivo válido dentro de `dir` (sin rutas), con una extensión permitida y que existe
function resolveFile(dir, extensions, file) {
  if (typeof file !== 'string' || !/^[\w.\- ]{1,150}$/.test(file) || file.includes('..')) return null;
  if (!extensions.includes(path.extname(file).toLowerCase())) return null;
  return fs.existsSync(path.join(dir, file)) ? file : null;
}

function listFiles(dir, extensions) {
  try {
    return fs.readdirSync(dir)
      .filter(f => extensions.includes(path.extname(f).toLowerCase()))
      .map(f => { const st = fs.statSync(path.join(dir, f)); return { name: f, size: st.size, mtime: st.mtimeMs }; })
      .sort((a, b) => b.mtime - a.mtime);
  } catch { return []; }
}

function deleteFile(dir, extensions, file) {
  const name = resolveFile(dir, extensions, file);
  if (!name) return false;
  fs.unlinkSync(path.join(dir, name));
  return true;
}

const resolveVideo = (file) => resolveFile(paths.VIDEOS_DIR, VIDEO_EXTENSIONS, file);
const resolveImage = (file) => resolveFile(paths.IMAGES_DIR, IMAGE_EXTENSIONS, file);
const listVideos = () => listFiles(paths.VIDEOS_DIR, VIDEO_EXTENSIONS);
const listImages = () => listFiles(paths.IMAGES_DIR, IMAGE_EXTENSIONS);
const deleteVideo = (file) => deleteFile(paths.VIDEOS_DIR, VIDEO_EXTENSIONS, file);
const deleteImage = (file) => deleteFile(paths.IMAGES_DIR, IMAGE_EXTENSIONS, file);

// ---------- Reproducir ----------
function emitPlay(n, payload, labelText) {
  io?.to(room(n)).to(previewRoom(n)).emit(`overlay:${KIND}:${n}:play`, payload);
  const linked = clientCount(n) > 0;
  return { executed: true, label: `${labelText} P${n}${linked ? '' : ' (sin enlazar)'}` };
}

// Reproduce un video en una pantalla (lo usa el paso "video" y el botón de probar)
function play(screen, { file, volume = 100 } = {}) {
  const n = parseInt(screen, 10);
  if (!SCREENS.includes(n)) return { executed: false };
  const name = resolveVideo(file);
  if (!name) {
    logger.warn('acciones', 'El video de la acción no existe en la biblioteca', { video: String(file).slice(0, 80), pantalla: n });
    return { executed: false };
  }
  const vol = Math.min(1, Math.max(0, (Number(volume) || 0) / 100));
  return emitPlay(n, { kind: 'video', file: name, url: `/videos/${encodeURIComponent(name)}`, volume: vol }, 'Video');
}

// Muestra una imagen o GIF en una pantalla durante `duration` segundos (lo usa el paso "imagen" y el botón de probar)
function playImage(screen, { file, duration = IMAGE_DEFAULT_SECONDS } = {}) {
  const n = parseInt(screen, 10);
  if (!SCREENS.includes(n)) return { executed: false };
  const name = resolveImage(file);
  if (!name) {
    logger.warn('acciones', 'La imagen de la acción no existe en la biblioteca', { imagen: String(file).slice(0, 80), pantalla: n });
    return { executed: false };
  }
  const seconds = Math.min(IMAGE_MAX_SECONDS, Math.max(IMAGE_MIN_SECONDS, Number(duration) || IMAGE_DEFAULT_SECONDS));
  return emitPlay(n, { kind: 'image', file: name, url: `/images/${encodeURIComponent(name)}`, durationMs: Math.round(seconds * 1000) }, 'Imagen');
}

function stop(screen) {
  const n = parseInt(screen, 10);
  if (SCREENS.includes(n)) io?.to(room(n)).to(previewRoom(n)).emit(`overlay:${KIND}:${n}:stop`);
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
        logger.info('overlay', `Pantalla ${n}: ${(last[n] || 0) === 0 ? 'enlazada' : c === 0 ? 'sin enlace (se desconectó)' : `${c} conexiones`}`, { conexiones: c });
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
    socket.on('overlay:error', ({ name, screen, reason, file, kind } = {}) => {
      if (name !== KIND) return;
      logger.warn('overlay', `Pantalla ${parseInt(screen, 10) || '?'}: no se pudo mostrar ${kind === 'image' ? 'la imagen' : 'el video'}`, { motivo: String(reason).slice(0, 80), archivo: String(file).slice(0, 80) });
    });
    socket.on('disconnect', broadcast);
    socket.emit(`overlay:${KIND}:clients`, counts());
  });
}

module.exports = {
  init, KIND, SCREENS, VIDEO_EXTENSIONS, IMAGE_EXTENSIONS, IMAGE_MIN_SECONDS, IMAGE_MAX_SECONDS, IMAGE_DEFAULT_SECONDS,
  getConfig, updateScreen, counts, clientCount,
  play, playImage, stop,
  listVideos, deleteVideo, resolveVideo,
  listImages, deleteImage, resolveImage,
  options: VIDEO_OPTIONS,
};
