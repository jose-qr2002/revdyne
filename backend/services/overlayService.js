// backend/services/overlayService.js
// Estado y lógica de los overlays (por ahora: meta de likes).
// La config persistente vive en overlays.json; el avance (likes actuales, meta
// vigente) vive solo en memoria y se reinicia al conectar a un directo.
const store = require('../data/store');
const entitlements = require('./entitlements');
const actionDispatcher = require('./actionDispatcher');
const { DEFAULT_OVERLAYS, DEFAULT_OVERLAY_STYLE, OVERLAY_FONTS } = require('../data/defaults');

const ON_REACH = ['keep', 'increase', 'double', 'hide'];
const STYLE_IDS = [1, 2, 3, 4, 5];
const EMIT_INTERVAL_MS = 150;     // los likes llegan en ráfagas; el overlay no necesita cada uno
const MAX_REACH_LOOPS = 50;       // tope de seguridad si la meta es mínima y llegan muchos likes de golpe

let io = null;
let emitTimer = null;

// live = likes de la sala (total de TikTok menos `offset`); manual = los del botón de probar.
// `offset` es 0 salvo tras 'Reiniciar', que vuelve a contar desde el total del momento.
const state = { current: 0, live: 0, manual: 0, lastTotal: 0, offset: 0, synced: false, goal: 0, reached: false, hidden: false };

// ---------- Sanitizado ----------
const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
// Va dentro de CSS url("..."): solo http(s) y sin caracteres que rompan la cadena.
const safeUrl = (v) => (typeof v === 'string' && /^https?:\/\/[^\s"'()\\]+$/.test(v.trim()) ? v.trim() : '');

function sanitizeStyle(input, base) {
  const s = { ...DEFAULT_OVERLAY_STYLE, ...base, ...input };
  return {
    font: OVERLAY_FONTS.includes(s.font) ? s.font : DEFAULT_OVERLAY_STYLE.font,
    fontSize: clampInt(s.fontSize, 10, 200, DEFAULT_OVERLAY_STYLE.fontSize),
    fontSpacing: clampInt(s.fontSpacing, 0, 200, DEFAULT_OVERLAY_STYLE.fontSpacing),
    barWidth: clampInt(s.barWidth, 30, 100, DEFAULT_OVERLAY_STYLE.barWidth),
    barHeight: clampInt(s.barHeight, 40, 100, DEFAULT_OVERLAY_STYLE.barHeight),
    barImage: safeUrl(s.barImage),
    titleColor: isHex(s.titleColor) ? s.titleColor : DEFAULT_OVERLAY_STYLE.titleColor,
    fontBorder: !!s.fontBorder,
    borderColor: isHex(s.borderColor) ? s.borderColor : DEFAULT_OVERLAY_STYLE.borderColor,
    progressColor: isHex(s.progressColor) ? s.progressColor : DEFAULT_OVERLAY_STYLE.progressColor,
    barColor: isHex(s.barColor) ? s.barColor : DEFAULT_OVERLAY_STYLE.barColor,
    bgColor: isHex(s.bgColor) ? s.bgColor : DEFAULT_OVERLAY_STYLE.bgColor,
    showTitle: !!s.showTitle,
    showPercent: !!s.showPercent,
    showProgress: !!s.showProgress,
    showIcon: !!s.showIcon,
    finalText: String(s.finalText ?? '').slice(0, 30),
  };
}

function sanitizeLikes(input, current) {
  const merged = { ...current, ...input };
  const styles = {};
  for (const id of STYLE_IDS) {
    styles[id] = sanitizeStyle(input?.styles?.[id], current.styles?.[id] || DEFAULT_OVERLAYS.likes.styles[id]);
  }
  return {
    goal: clampInt(merged.goal, 1, 100000000, DEFAULT_OVERLAYS.likes.goal),
    title: String(merged.title ?? '').slice(0, 60),
    onReach: ON_REACH.includes(merged.onReach) ? merged.onReach : 'increase',
    actionId: typeof merged.actionId === 'string' ? merged.actionId.slice(0, 80) : '',
    activeStyle: STYLE_IDS.includes(Number(merged.activeStyle)) ? Number(merged.activeStyle) : 1,
    styles,
  };
}

// ---------- Config ----------
function getLikesConfig() {
  const stored = store.loadOverlays().likes || {};
  return sanitizeLikes(stored, DEFAULT_OVERLAYS.likes);
}

function updateLikesConfig(patch) {
  const before = getLikesConfig();
  const next = sanitizeLikes(patch, before);
  store.saveOverlays({ ...store.loadOverlays(), schemaVersion: 1, likes: next });

  // Cambiar la meta base reinicia la meta vigente; el resto de ajustes no tocan el avance.
  if (next.goal !== before.goal) {
    state.goal = next.goal;
    state.reached = false;
    state.hidden = false;
    checkGoal(true); // si la nueva meta ya está superada, se salta sin disparar la acción
  }
  scheduleEmit(true);
  return next;
}

// ---------- Estado público ----------
function snapshot() {
  const cfg = getLikesConfig();
  if (!state.goal) state.goal = cfg.goal;
  return {
    current: state.current,
    goal: state.goal,
    hidden: state.hidden,
    title: cfg.title,
    style: cfg.styles[cfg.activeStyle],
    styleId: cfg.activeStyle,
  };
}

function clientCount() {
  return io?.sockets.adapter.rooms.get('overlay:likes')?.size || 0;
}

function emitNow() {
  emitTimer = null;
  io?.emit('overlay:likes:state', snapshot());
}

function scheduleEmit(immediate = false) {
  if (immediate) {
    if (emitTimer) clearTimeout(emitTimer);
    return emitNow();
  }
  if (!emitTimer) emitTimer = setTimeout(emitNow, EMIT_INTERVAL_MS);
}

// ---------- Lógica de meta ----------
function findAction(actionId) {
  if (!actionId) return null;
  const profiles = store.loadProfiles();
  if (!entitlements.allowedIds(profiles).actions.has(actionId)) return null; // respeta el límite del plan gratis
  const activeId = profiles.activeProfileId;
  return profiles.list.prof_global?.actions?.[actionId]
    || profiles.list[activeId]?.actions?.[actionId]
    || null;
}

function runFinishAction(cfg) {
  const action = findAction(cfg.actionId);
  if (!action) return;
  const result = actionDispatcher.dispatch(action, {
    times: 1,
    defaultDelayMs: store.loadSettings().keyDelayMs || 80,
  });
  io?.emit('giftReceived', {
    giftId: 'overlay_likes_goal', giftName: `🎯 Meta de likes alcanzada (${state.goal})`, coins: 0,
    sender: 'Overlay', newCount: 1,
    key: result.label || 'Ninguna', pressed: !!result.executed, timestamp: Date.now(),
  });
}

function checkGoal(silent = false) {
  const cfg = getLikesConfig();

  // Meta ya superada al sincronizar (p. ej. el directo ya tenía 20.000 likes y la meta es 5.000):
  // se salta a la meta vigente sin disparar acciones de metas que no se alcanzaron en vivo.
  if (silent) {
    if (state.hidden || state.reached || state.current < state.goal) return;
    if (cfg.onReach === 'increase') state.goal += (Math.floor((state.current - state.goal) / cfg.goal) + 1) * cfg.goal;
    else if (cfg.onReach === 'double') { while (state.goal <= state.current) state.goal *= 2; }
    else if (cfg.onReach === 'hide') state.hidden = true;
    else state.reached = true;
    return;
  }

  for (let i = 0; i < MAX_REACH_LOOPS; i++) {
    if (state.hidden || state.reached || state.current < state.goal) return;

    runFinishAction(cfg);

    if (cfg.onReach === 'increase') state.goal += cfg.goal;
    else if (cfg.onReach === 'double') state.goal *= 2;
    else if (cfg.onReach === 'hide') state.hidden = true;
    else state.reached = true; // keep: se queda al 100% y no vuelve a disparar
  }
}

function recompute(silent = false) {
  if (!state.goal) state.goal = getLikesConfig().goal;
  state.current = state.manual + state.live;
  checkGoal(silent);
  scheduleEmit();
}

// Suma manual (botón de probar)
function addLikes(count) {
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n <= 0) return;
  state.manual += n;
  recompute();
}

// Evento 'like' de TikTok. La barra muestra los likes totales de la sala (los que ya tenía el
// directo al conectar más los nuevos), igual que el contador de TikTok. Se usa el total acumulado
// y no la suma de ráfagas, porque TikTok agrupa y descarta mensajes en directos con muchos likes.
// En tiktok-live-proto v3 (el que usa la librería) los campos son `count` (número) y `total`
// (string); `likeCount`/`totalLikeCount` son de v1 y se aceptan por compatibilidad.
function addLiveLikes(data = {}) {
  const batch = Math.max(0, Math.floor(Number(data.count ?? data.likeCount)) || 0);
  const total = Math.floor(Number(data.total ?? data.totalLikeCount));
  if (Number.isFinite(total) && total > 0) {
    if (total > state.lastTotal) state.lastTotal = total; // ignora totales atrasados (mensajes desordenados)
    state.live = Math.max(0, state.lastTotal - state.offset);
  } else {
    state.live += batch || 1; // sin total fiable: se suma la ráfaga
  }
  const firstSync = !state.synced;
  state.synced = true;
  recompute(firstSync);
}

// fromNow=true (botón Reiniciar): la barra vuelve a 0 y cuenta desde el total actual de la sala.
// fromNow=false (nueva conexión): se descarta todo y el primer evento fija el punto de partida.
function reset(fromNow = false) {
  state.manual = 0;
  state.live = 0;
  state.current = 0;
  state.offset = fromNow ? state.lastTotal : 0;
  if (!fromNow) { state.lastTotal = 0; state.synced = false; }
  state.goal = getLikesConfig().goal;
  state.reached = false;
  state.hidden = false;
  scheduleEmit(true);
}

// ---------- Sockets ----------
function init(ioInstance) {
  io = ioInstance;
  state.goal = getLikesConfig().goal;

  const broadcastClients = () => io.emit('overlay:likes:clients', clientCount());

  io.on('connection', (socket) => {
    // El overlay real entra a 'overlay:likes' (cuenta como conexión de OBS);
    // la vista previa del panel entra a otra sala para no contarse.
    socket.on('overlay:join', ({ name, preview } = {}) => {
      if (name !== 'likes') return;
      if (!preview) { socket.join('overlay:likes'); broadcastClients(); }
      socket.emit('overlay:likes:state', snapshot());
    });
    socket.on('disconnect', broadcastClients);
    socket.emit('overlay:likes:clients', clientCount());
  });
}

module.exports = {
  init, getLikesConfig, updateLikesConfig, snapshot, clientCount,
  addLikes, addLiveLikes, reset,
  fonts: OVERLAY_FONTS,
  defaultStyles: () => DEFAULT_OVERLAYS.likes.styles,
};
