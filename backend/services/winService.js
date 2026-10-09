// backend/services/winService.js
// Overlay "Win Game": un contador de victorias "conteo / meta" que se maneja a mano (botones del panel y atajos de teclado globales).
// No depende de TikTok: el streamer suma o resta cuando gana o pierde una partida.
//
// Se guarda todo en overlays.json, clave `win`: { goal, count, activeStyle, styles: {1..5}, keyIncrease, keyDecrease }.
// El conteo y la meta sobreviven al cierre de la app. Como el resto de overlays, solo se emite a la página cuando hay un overlay
// real enlazado o una vista previa del panel abierta.
const fs = require('fs');
const path = require('path');
const store = require('../data/store');
const paths = require('../paths');
const logger = require('./logger');
const { DEFAULT_OVERLAYS, OVERLAY_FONTS, WIN_FONTS, WIN_OPTIONS } = require('../data/defaults');

const KIND = 'win';
const STYLE_IDS = [1, 2, 3, 4, 5];
const MAX_VALUE = 999999;
const SAVE_DEBOUNCE_MS = 500;
const EMIT_INTERVAL_MS = 80;
const MEDIA_GRACE_MS = 60 * 1000; // un archivo recién subido no se borra aunque todavía no esté asignado a un estilo

let io = null;
let emitTimer = null;
let saveTimer = null;
let shortcutsListener = null;

// ---------- Config ----------
const isHex = (v) => typeof v === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
// Imagen/GIF/video de fondo: un archivo subido a la app (/media/...) o una URL http(s)
const validMedia = (v) => typeof v === 'string' && v.length <= 500 && (/^\/media\/[\w.\-]{1,120}$/.test(v) || /^https?:\/\/[^\s]+$/.test(v));

function sanitizeStyle(input, current, defaults) {
  const m = { ...current, ...input };
  const hex = (key) => (isHex(m[key]) ? m[key] : defaults[key]);
  return {
    layout: oneOf(m.layout, WIN_OPTIONS.layouts, defaults.layout),
    bgStyle: oneOf(m.bgStyle, WIN_OPTIONS.bgStyles, defaults.bgStyle),
    bgColor: hex('bgColor'),
    bgMedia: m.bgMedia === '' || validMedia(m.bgMedia) ? m.bgMedia : defaults.bgMedia,
    text: String(m.text ?? '').slice(0, 30),
    font: [...OVERLAY_FONTS, ...WIN_FONTS].includes(m.font) ? m.font : defaults.font,
    fontSize: clampInt(m.fontSize, 10, 200, defaults.fontSize),
    letterSpacing: clampInt(m.letterSpacing, -5, 50, defaults.letterSpacing),
    textStyle: oneOf(m.textStyle, WIN_OPTIONS.textStyles, defaults.textStyle),
    textColor: hex('textColor'),
    iconMode: oneOf(m.iconMode, WIN_OPTIONS.iconModes, defaults.iconMode),
    icon: oneOf(m.icon, WIN_OPTIONS.icons, defaults.icon),
    counterFontSize: clampInt(m.counterFontSize, 10, 300, defaults.counterFontSize),
    counterBg: hex('counterBg'),
    goalBg: hex('goalBg'),
    counterColor: hex('counterColor'),
    negativeColor: hex('negativeColor'),
    separatorColor: hex('separatorColor'),
  };
}

// Atajos globales: vacío = sin asignar. Solo texto corto con el formato de Electron (p. ej. "CommandOrControl+Shift+A", "num8")
const sanitizeKey = (v) => (typeof v === 'string' && /^[\w+]{0,60}$/.test(v) ? v : '');

function sanitize(input, current) {
  const d = DEFAULT_OVERLAYS[KIND];
  const m = { ...current, ...input };
  const styles = {};
  for (const id of STYLE_IDS) {
    const patch = input?.styles?.[id];
    styles[id] = sanitizeStyle(patch || {}, current?.styles?.[id] || d.styles[id], d.styles[id]);
  }
  return {
    goal: clampInt(m.goal, 0, MAX_VALUE, d.goal),
    count: clampInt(m.count, -MAX_VALUE, MAX_VALUE, d.count),
    activeStyle: STYLE_IDS.includes(Number(m.activeStyle)) ? Number(m.activeStyle) : d.activeStyle,
    styles,
    keyIncrease: sanitizeKey(m.keyIncrease),
    keyDecrease: sanitizeKey(m.keyDecrease),
  };
}

let cache = null;
function getConfig() {
  if (!cache) cache = sanitize({}, store.loadOverlays()[KIND] || {});
  return cache;
}

function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try { store.saveOverlays({ ...store.loadOverlays(), schemaVersion: 1, [KIND]: getConfig() }); }
  catch (e) { logger.warn('overlay', 'No se pudo guardar el Win Game', { error: e.message }); }
}
// El conteo cambia a menudo (atajos): se guarda con debounce
function writeSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(writeNow, SAVE_DEBOUNCE_MS);
  if (saveTimer.unref) saveTimer.unref();
}
const flush = () => { if (saveTimer) writeNow(); };

// ---------- Estado / sockets ----------
const room = () => `overlay:${KIND}`;
const previewRoom = () => `overlay-preview:${KIND}`;
const clientCount = () => io?.sockets.adapter.rooms.get(room())?.size || 0;
const isActive = () => clientCount() > 0;
const hasPreview = () => (io?.sockets.adapter.rooms.get(previewRoom())?.size || 0) > 0;

function snapshot() {
  const cfg = getConfig();
  return { kind: KIND, goal: cfg.goal, count: cfg.count, styleId: cfg.activeStyle, style: cfg.styles[cfg.activeStyle] };
}

function emitNow() {
  emitTimer = null;
  io?.emit(`overlay:${KIND}:state`, snapshot());
}
function scheduleEmit(immediate = false) {
  if (immediate) {
    if (emitTimer) clearTimeout(emitTimer);
    return emitNow();
  }
  if (!emitTimer) emitTimer = setTimeout(emitNow, EMIT_INTERVAL_MS);
}
const publish = (immediate = false) => { if (isActive() || hasPreview() || immediate) scheduleEmit(immediate); };

// ---------- Acciones ----------
// Cambiar la meta y/o el conteo a un valor concreto
function setValues({ goal, count } = {}) {
  const cfg = getConfig();
  if (goal !== undefined) cfg.goal = clampInt(goal, 0, MAX_VALUE, cfg.goal);
  if (count !== undefined) cfg.count = clampInt(count, -MAX_VALUE, MAX_VALUE, cfg.count);
  writeSoon();
  publish(true);
  return snapshot();
}

// Sumar o restar al conteo (botones del panel y atajos de teclado)
function adjustCount(delta) {
  const cfg = getConfig();
  cfg.count = clampInt(cfg.count + Math.round(Number(delta) || 0), -MAX_VALUE, MAX_VALUE, cfg.count);
  writeSoon();
  publish(true);
  return snapshot();
}

const adjustGoal = (delta) => {
  const cfg = getConfig();
  return setValues({ goal: cfg.goal + Math.round(Number(delta) || 0) });
};

const resetCount = () => setValues({ count: 0 });

// ---------- Estilos y atajos ----------
function updateConfig(patch) {
  const before = getConfig();
  const next = sanitize({ ...patch, goal: before.goal, count: before.count }, before);
  const keysChanged = next.keyIncrease !== before.keyIncrease || next.keyDecrease !== before.keyDecrease;
  cache = next;
  writeNow();
  pruneMedia();
  publish(true);
  if (keysChanged && shortcutsListener) shortcutsListener();
  return cache;
}

function resetStyle(id) {
  if (!STYLE_IDS.includes(Number(id))) return getConfig();
  return updateConfig({ styles: { [id]: DEFAULT_OVERLAYS[KIND].styles[id] } });
}

// Borra de /media los archivos que ya no usa ningún estilo
function pruneMedia() {
  try {
    if (!fs.existsSync(paths.MEDIA_DIR)) return;
    const used = new Set(Object.values(getConfig().styles).map(s => path.basename(s.bgMedia || '')).filter(Boolean));
    for (const file of fs.readdirSync(paths.MEDIA_DIR)) {
      if (used.has(file) || !file.startsWith('win_')) continue;
      const full = path.join(paths.MEDIA_DIR, file);
      if (Date.now() - fs.statSync(full).mtimeMs > MEDIA_GRACE_MS) fs.unlinkSync(full);
    }
  } catch (e) { logger.warn('overlay', 'No se pudo limpiar la carpeta de medios', { error: e.message }); }
}

// main.js se suscribe para volver a registrar los atajos globales cuando cambian
const getShortcuts = () => ({ keyIncrease: getConfig().keyIncrease, keyDecrease: getConfig().keyDecrease });
const onShortcutsChanged = (fn) => { shortcutsListener = fn; };

// ---------- Sockets ----------
function init(ioInstance) {
  io = ioInstance;
  const broadcastClients = () => io.emit(`overlay:${KIND}:clients`, clientCount());
  let last = 0;
  io.on('connection', (socket) => {
    socket.on('overlay:join', ({ name, preview } = {}) => {
      if (name !== KIND) return;
      if (preview) socket.join(previewRoom());
      else {
        socket.join(room());
        broadcastClients();
        const n = clientCount();
        if (n !== last) { logger.info('overlay', `Overlay Win Game: ${last === 0 ? 'enlazado' : n === 0 ? 'sin enlace (se desconectó)' : `${n} conexiones`}`, { conexiones: n }); last = n; }
      }
      socket.emit(`overlay:${KIND}:state`, snapshot());
    });
    socket.on('disconnect', () => {
      broadcastClients();
      const n = clientCount();
      if (n !== last) { if (n === 0) logger.info('overlay', 'Overlay Win Game: sin enlace (se desconectó)', { conexiones: 0 }); last = n; }
    });
    socket.emit(`overlay:${KIND}:clients`, clientCount());
  });
}

module.exports = {
  init, flush, KIND, STYLE_IDS,
  getConfig, snapshot, clientCount, isActive,
  setValues, adjustCount, adjustGoal, resetCount, updateConfig, resetStyle,
  getShortcuts, onShortcutsChanged,
  fonts: [...OVERLAY_FONTS, ...WIN_FONTS],
  options: WIN_OPTIONS,
  defaultStyle: (id) => DEFAULT_OVERLAYS[KIND].styles[id],
};
