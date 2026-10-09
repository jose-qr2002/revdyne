// backend/services/rankingService.js
// Overlays "Top 10": donadores (monedas), likes, comentarios y compartidas. Cada métrica tiene tres tops:
//   - del directo (rk_<métrica>): se reinicia al cerrar la app, al conectar a OTRO usuario o con el botón de reinicio
//     (una caída de conexión NO lo borra, igual que el mejor regalo / combo).
//   - del día (rk_<métrica>_day): se guarda en rankings.json por streamer y se reinicia a medianoche (hora local); sobrevive a
//     cerrar la app y a varios directos el mismo día.
//   - del mes (rk_<métrica>_month): igual que el del día pero se reinicia al empezar el mes.
// Los datos se llevan siempre (es barato); solo se emite a los overlays cuando hay uno enlazado (OBS / Live Studio) o una
// vista previa del panel abierta (sala overlay-preview:<kind>), como en el resto de overlays.
const store = require('../data/store');
const logger = require('./logger');
const { DEFAULT_OVERLAYS, OVERLAY_FONTS } = require('../data/defaults');

const METRICS = {
  gifters: { label: 'Donadores', unit: 'coins' },
  likes: { label: 'Likes', unit: 'likes' },
  comments: { label: 'Comentarios', unit: 'comments' },
  shares: { label: 'Compartidas', unit: 'shares' },
};
// kind -> { metric, period: 'live' | 'day' | 'month', slug }
const PERIODS = [['live', '', ''], ['day', '_day', '-daily'], ['month', '_month', '-monthly']];
const KINDS = {};
for (const metric of Object.keys(METRICS)) {
  for (const [period, kindSuffix, slugSuffix] of PERIODS) KINDS[`rk_${metric}${kindSuffix}`] = { metric, period, slug: `${metric}${slugSuffix}` };
}
const STYLE_IDS = [1, 2];
const EMIT_INTERVAL_MS = 250;
const SAVE_DEBOUNCE_MS = 3000;
const MAX_ENTRIES = 600;   // por tablero; al pasarse se descartan los de menor valor
const KEEP_ENTRIES = 400;
const MAX_ROWS = 10;

let io = null;
let owner = null;     // usuario cuyos tops del día y del mes se muestran (minúsculas, sin @)
let liveOwner = null; // usuario al que pertenece el top del directo (el de la última conexión)
const live = {};  // metric -> Map(key -> entry)
for (const m of Object.keys(METRICS)) live[m] = new Map();
const demo = {};  // kind -> filas de ejemplo (botón "Probar"); se descartan con el primer dato real o al reiniciar
const emitTimers = {};
let saveTimer = null;
let periodData = null; // { day: { date, owners }, month: { date, owners } }; owners: { [usuario]: { [metric]: { [key]: entry } } }
const avatars = new Map(); // key -> último avatar conocido (el evento "share" no lo trae)

const kindOf = (kind) => (Object.prototype.hasOwnProperty.call(KINDS, kind) ? kind : null);

// ---------- Config ----------
const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function sanitize(kind, input, current) {
  const d = DEFAULT_OVERLAYS[kind];
  const m = { ...current, ...input };
  const hex = (key) => (isHex(m[key]) ? m[key] : d[key]);
  return {
    activeStyle: STYLE_IDS.includes(Number(m.activeStyle)) ? Number(m.activeStyle) : d.activeStyle,
    title: String(m.title ?? '').slice(0, 40),
    font: OVERLAY_FONTS.includes(m.font) ? m.font : d.font,
    fontScale: clampInt(m.fontScale, 60, 160, d.fontScale),
    valueScale: clampInt(m.valueScale, 50, 150, d.valueScale),
    rows: clampInt(m.rows, 3, MAX_ROWS, d.rows),
    showTitle: !!m.showTitle,
    showAvatar: !!m.showAvatar,
    showCards: !!m.showCards,
    rainbowNames: !!m.rainbowNames,
    showEmpty: !!m.showEmpty,
    animate: !!m.animate,
    titleColor: hex('titleColor'),
    nameColor: hex('nameColor'),
    valueColor: hex('valueColor'),
    cardColor: hex('cardColor'),
    cardOpacity: clampInt(m.cardOpacity, 0, 100, d.cardOpacity),
  };
}

const configCache = {};
function getConfig(kind) {
  if (!configCache[kind]) configCache[kind] = sanitize(kind, store.loadOverlays()[kind] || {}, DEFAULT_OVERLAYS[kind]);
  return configCache[kind];
}

function updateConfig(kind, patch) {
  const next = sanitize(kind, patch, getConfig(kind));
  store.saveOverlays({ ...store.loadOverlays(), schemaVersion: 1, [kind]: next });
  configCache[kind] = next;
  scheduleEmit(kind, true);
  return next;
}

// ---------- Tableros del día y del mes (rankings.json) ----------
const pad = (n) => String(n).padStart(2, '0');
// Marca del periodo actual (hora local): cuando cambia, el tablero empieza de cero
const periodStamp = (period) => {
  const d = new Date();
  return period === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Datos de un periodo ('day' | 'month'); lo guardado de otro día/mes se descarta
function loadPeriod(period) {
  if (!periodData) {
    const raw = store.loadRankings() || {};
    periodData = raw.owners && raw.date ? { day: raw } : raw; // formato anterior: solo había el del día
  }
  const stamp = periodStamp(period);
  if (!periodData[period] || periodData[period].date !== stamp || !periodData[period].owners) periodData[period] = { date: stamp, owners: {} };
  return periodData[period];
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { store.saveRankings({ day: loadPeriod('day'), month: loadPeriod('month') }); } catch (e) { logger.warn('overlay', 'No se pudo guardar los tops del día y del mes', { error: e.message }); }
  }, SAVE_DEBOUNCE_MS);
  if (saveTimer.unref) saveTimer.unref();
}

// Mapa (key -> entry) del tablero de un kind. En los del día y del mes, es el del streamer actual.
function boardOf(kind) {
  const { metric, period } = KINDS[kind];
  // El top del directo es del último usuario conectado: si se está viendo la cuenta de otro, se muestra vacío (sin borrar nada)
  if (period === 'live') return liveOwner && owner !== liveOwner ? new Map() : live[metric];
  const data = loadPeriod(period);
  const who = owner || '_';
  if (!data.owners[who]) data.owners[who] = {};
  if (!data.owners[who][metric]) data.owners[who][metric] = {};
  return data.owners[who][metric];
}
const valuesOf = (board) => (board instanceof Map ? [...board.values()] : Object.values(board));

function trim(board) {
  const list = valuesOf(board);
  if (list.length <= MAX_ENTRIES) return;
  list.sort((a, b) => b.value - a.value);
  for (const e of list.slice(KEEP_ENTRIES)) (board instanceof Map ? board.delete(e.key) : delete board[e.key]);
}

// ---------- Estado ----------
const room = (kind) => `overlay:${kind}`;
const previewRoom = (kind) => `overlay-preview:${kind}`;
const clientCount = (kind) => io?.sockets.adapter.rooms.get(room(kind))?.size || 0;
const isActive = (kind) => clientCount(kind) > 0;
const hasPreview = (kind) => (io?.sockets.adapter.rooms.get(previewRoom(kind))?.size || 0) > 0;

const sortedEntries = (kind) => valuesOf(boardOf(kind)).sort((a, b) => b.value - a.value || a.order - b.order);

function snapshot(kind, limit = getConfig(kind).rows) {
  const cfg = getConfig(kind);
  const list = demo[kind] || sortedEntries(kind);
  return {
    kind, config: cfg, demo: !!demo[kind], owner,
    rows: list.slice(0, limit).map((e, i) => ({ rank: i + 1, key: e.key, name: e.name, username: e.username, avatar: e.avatar || '', value: e.value })),
  };
}

function emitNow(kind) {
  emitTimers[kind] = null;
  io?.emit(`overlay:${kind}:state`, snapshot(kind));
}
function scheduleEmit(kind, immediate = false) {
  if (immediate) {
    if (emitTimers[kind]) clearTimeout(emitTimers[kind]);
    return emitNow(kind);
  }
  if (!emitTimers[kind]) emitTimers[kind] = setTimeout(() => emitNow(kind), EMIT_INTERVAL_MS);
}

// ---------- Registro ----------
// user: { key, name, username, avatar }; amount: monedas / likes / 1 comentario / 1 compartida
let orderSeq = 0;
function record(metric, user, amount) {
  const n = Math.floor(Number(amount));
  if (!METRICS[metric] || !user?.key || !(n > 0)) return;
  // El propio streamer no entra en sus tops (sus comentarios/likes distorsionarían el ranking)
  if (owner && user.username && String(user.username).replace(/^@/, '').toLowerCase() === owner) return;

  if (user.avatar) avatars.set(user.key, user.avatar);
  if (avatars.size > 5000) avatars.clear();
  const avatar = user.avatar || avatars.get(user.key) || '';

  for (const kind of Object.keys(KINDS)) {
    if (KINDS[kind].metric !== metric) continue;
    const board = boardOf(kind);
    const isMap = board instanceof Map;
    let e = isMap ? board.get(user.key) : board[user.key];
    if (!e) {
      e = { key: user.key, name: user.name || user.username || 'Anónimo', username: user.username || '', avatar, value: 0, order: ++orderSeq };
      if (isMap) board.set(user.key, e); else board[user.key] = e;
    } else {
      if (user.name) e.name = user.name;
      if (user.username) e.username = user.username;
      if (avatar) e.avatar = avatar;
    }
    e.value += n;
    trim(board);
    if (demo[kind]) delete demo[kind];
    if (KINDS[kind].period !== 'live') scheduleSave();
    if (isActive(kind) || hasPreview(kind)) scheduleEmit(kind);
  }
}

// Se llama al conectar. Reconectar al MISMO usuario conserva el top del directo; otro usuario es otro directo.
function setOwner(username) {
  const name = String(username || '').replace(/^@/, '').toLowerCase() || null;
  if (!name) return;
  if (liveOwner && liveOwner !== name) for (const m of Object.keys(live)) { live[m].clear(); refreshMetric(m); }
  liveOwner = name;
  setViewOwner(name);
}

// ¿Hay tops guardados (día o mes) de este usuario?
function hasSavedData(name) {
  for (const period of ['day', 'month']) {
    const mine = loadPeriod(period).owners[name];
    if (mine && Object.values(mine).some(board => Object.keys(board).length > 0)) return true;
  }
  return false;
}

function setViewOwner(name) {
  if (owner === name) return false;
  owner = name;
  for (const kind of Object.keys(KINDS)) if (isActive(kind) || hasPreview(kind)) scheduleEmit(kind, true);
  return true;
}

// El usuario terminó de escribir otro usuario en la barra lateral (sin conectar): si tiene tops guardados, se pasa a verlos;
// si no tiene datos, se queda el que se estaba viendo. Mientras hay una conexión no se cambia (la gobierna setOwner).
function previewOwner(username, connected) {
  const name = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!name || connected) return { switched: false, owner };
  if (name !== owner && !hasSavedData(name)) return { switched: false, owner };
  return { switched: setViewOwner(name), owner };
}

function refreshMetric(metric) {
  for (const kind of Object.keys(KINDS)) if (KINDS[kind].metric === metric && (isActive(kind) || hasPreview(kind))) scheduleEmit(kind);
}

function removeEntry(kind, key) {
  const board = boardOf(kind);
  const had = board instanceof Map ? board.delete(key) : (key in board && delete board[key]);
  if (!had) return false;
  if (KINDS[kind].period !== 'live') scheduleSave();
  scheduleEmit(kind, true);
  return true;
}

function reset(kind) {
  const board = boardOf(kind);
  if (board instanceof Map) board.clear(); else for (const k of Object.keys(board)) delete board[k];
  delete demo[kind];
  if (KINDS[kind].period !== 'live') scheduleSave();
  scheduleEmit(kind, true);
}

// Datos de ejemplo para el botón "Probar" (no tocan los tops reales ni lo guardado)
function test(kind) {
  const base = { coins: 2840, likes: 1520, comments: 214, shares: 36 }[KINDS[kind].metric];
  const names = ['Omodox', 'Gonta', 'Sahavovo', 'Wolfich', 'Stasie', 'jendeRENO', 'Marco', 'Lucía', 'Andrés', 'Valeria'];
  demo[kind] = names.map((name, i) => ({ key: `demo${i}`, name, username: name.toLowerCase(), avatar: '', value: Math.max(1, Math.round(base * Math.pow(0.72, i))), order: i }));
  scheduleEmit(kind, true);
}

// ---------- Sockets ----------
function init(ioInstance) {
  io = ioInstance;
  // Antes de conectar, el top del día que se ve es el del usuario configurado
  try { owner = String(store.loadSettings().username || '').replace(/^@/, '').toLowerCase() || owner; } catch { /* sin config: owner se fija al conectar */ }
  const lastClients = {};
  const broadcastClients = () => {
    for (const kind of Object.keys(KINDS)) {
      const n = clientCount(kind);
      io.emit(`overlay:${kind}:clients`, n);
      if ((lastClients[kind] || 0) !== n) {
        logger.info('overlay', `Overlay ${getConfig(kind).title}: ${(lastClients[kind] || 0) === 0 ? 'enlazado' : n === 0 ? 'sin enlace (se desconectó)' : `${n} conexiones`}`, { conexiones: n });
        lastClients[kind] = n;
      }
    }
  };
  io.on('connection', (socket) => {
    socket.on('overlay:join', ({ name, preview } = {}) => {
      const kind = kindOf(name);
      if (!kind) return;
      if (preview) socket.join(previewRoom(kind));
      else { socket.join(room(kind)); broadcastClients(); }
      socket.emit(`overlay:${kind}:state`, snapshot(kind));
    });
    socket.on('disconnect', broadcastClients);
    for (const kind of Object.keys(KINDS)) socket.emit(`overlay:${kind}:clients`, clientCount(kind));
  });
}

// Guarda lo pendiente al cerrar la app
function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; try { store.saveRankings({ day: loadPeriod('day'), month: loadPeriod('month') }); } catch { /* sin disco: se pierde solo lo de los últimos segundos */ } }
}

module.exports = {
  init, setOwner, previewOwner, flush, kinds: Object.keys(KINDS), kindOf, KINDS, METRICS,
  getConfig, updateConfig, snapshot, clientCount, isActive,
  record, removeEntry, reset, test,
  fonts: OVERLAY_FONTS,
  defaultConfig: (kind) => DEFAULT_OVERLAYS[kind],
};
