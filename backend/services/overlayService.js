// backend/services/overlayService.js
// Estado y lógica de las metas de los overlays (likes y seguidores).
// La config persistente vive en overlays.json; el avance (total actual, meta vigente) vive solo
// en memoria y se reinicia al conectar a un directo.
//
// Las metas solo "trabajan" (disparan acciones, emiten al overlay, consultan el perfil) mientras
// hay un overlay real enlazado (OBS / Live Studio). Sin enlace solo se llevan cuentas baratas y,
// al enlazar, se sincroniza en silencio.
const store = require('../data/store');
const entitlements = require('./entitlements');
const actionDispatcher = require('./actionDispatcher');
const logger = require('./logger');
const { DEFAULT_OVERLAYS, DEFAULT_OVERLAY_STYLE, OVERLAY_FONTS } = require('../data/defaults');

const ON_REACH = ['keep', 'increase', 'double', 'hide'];
const COUNT_MODES = ['total', 'live']; // total: empieza con lo que ya hay; live: solo lo nuevo del directo
const STYLE_IDS = [1, 2, 3, 4, 5];
const EMIT_INTERVAL_MS = 150;     // los eventos llegan en ráfagas; el overlay no necesita cada uno
const MAX_REACH_LOOPS = 50;       // tope de seguridad si la meta es mínima y llegan muchos de golpe

// Tipos de meta; 'label' se usa en los mensajes del log.
const KINDS = {
  likes: { label: 'likes' },
  followers: { label: 'seguidores' },
  shares: { label: 'compartidas' },
  viewers: { label: 'espectadores' },
  coins: { label: 'monedas' },
};
const kindOf = (kind) => (Object.prototype.hasOwnProperty.call(KINDS, kind) ? kind : null);

let io = null;
// Los registra tiktokService: followerTotalNow() = seguidores del streamer según la conexión (sin red);
// fetchFollowerTotal() = lo mismo pero refrescado desde TikTok (una petición).
const hooks = { followerTotalNow: null, fetchFollowerTotal: null, viewersNow: null }; // viewersNow(): espectadores actuales según la conexión

// current = lo que muestra la barra = manual + live.
// live    = total que informa TikTok (lastTotal) menos `offset`; manual = lo del botón de probar.
//   likes:      campo `total` del evento like.
//   followers:  `roomInfo` al conectar y `followCount` del evento follow (ambos exactos).
// `offset` es 0 salvo en el modo 'live' (solo lo nuevo) y tras 'Reiniciar', que cuentan desde un valor.
const newState = () => ({
  current: 0, live: 0, manual: 0, lastTotal: 0, offset: 0, offsetSet: false, synced: false,
  fetching: false,
  goal: 0, reached: false, hidden: false, emitTimer: null,
});
const states = { likes: newState(), followers: newState(), shares: newState(), viewers: newState(), coins: newState() };

// Usuarios que ya compartieron en este directo (siempre se llena, para poder activar "una por usuario" sobre la marcha).
const sharedUsers = new Set();
const MAX_SHARED_USERS = 50000;

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

function sanitizeGoal(kind, input, current) {
  const merged = { ...current, ...input };
  const defaults = DEFAULT_OVERLAYS[kind];
  const styles = {};
  for (const id of STYLE_IDS) {
    styles[id] = sanitizeStyle(input?.styles?.[id], current.styles?.[id] || defaults.styles[id]);
  }
  return {
    goal: clampInt(merged.goal, 1, 100000000, defaults.goal),
    title: String(merged.title ?? '').slice(0, 60),
    onReach: ON_REACH.includes(merged.onReach) ? merged.onReach : 'increase',
    countMode: COUNT_MODES.includes(merged.countMode) ? merged.countMode : 'total',
    allowMultiple: kind === 'shares' && !!merged.allowMultiple,
    actionId: typeof merged.actionId === 'string' ? merged.actionId.slice(0, 80) : '',
    activeStyle: STYLE_IDS.includes(Number(merged.activeStyle)) ? Number(merged.activeStyle) : 1,
    styles,
  };
}

// ---------- Config ----------
// Se cachea en memoria: los eventos de likes llegan a decenas por segundo y no deben leer el disco.
const configCache = {};
function getConfig(kind) {
  if (!configCache[kind]) {
    configCache[kind] = sanitizeGoal(kind, store.loadOverlays()[kind] || {}, DEFAULT_OVERLAYS[kind]);
  }
  return configCache[kind];
}

function updateConfig(kind, patch) {
  const state = states[kind];
  const before = getConfig(kind);
  const next = sanitizeGoal(kind, patch, before);
  store.saveOverlays({ ...store.loadOverlays(), schemaVersion: 1, [kind]: next });
  configCache[kind] = next;

  // Cambiar la forma de contar reinicia el conteo: se vuelve a sincronizar con el siguiente dato.
  if (next.countMode !== before.countMode) {
    reset(kind, false);
  } else if (next.goal !== before.goal) {
    // Cambiar la meta base reinicia la meta vigente; el resto de ajustes no tocan el avance.
    state.goal = next.goal;
    state.reached = false;
    state.hidden = false;
    checkGoal(kind, true); // si la nueva meta ya está superada, se salta sin disparar la acción
  }
  scheduleEmit(kind, true);
  return next;
}

// ---------- Estado público ----------
function snapshot(kind) {
  const state = states[kind];
  const cfg = getConfig(kind);
  if (!state.goal) state.goal = cfg.goal;
  return {
    kind,
    current: state.current,
    goal: state.goal,
    hidden: state.hidden,
    title: cfg.title,
    style: cfg.styles[cfg.activeStyle],
    styleId: cfg.activeStyle,
  };
}

// Sala de Socket.IO de los overlays reales (OBS / Live Studio); la vista previa del panel no entra.
const room = (kind) => `overlay:${kind}`;
function clientCount(kind) {
  return io?.sockets.adapter.rooms.get(room(kind))?.size || 0;
}
const isActive = (kind) => clientCount(kind) > 0;

function emitNow(kind) {
  states[kind].emitTimer = null;
  io?.emit(`overlay:${kind}:state`, snapshot(kind));
}

function scheduleEmit(kind, immediate = false) {
  const state = states[kind];
  if (immediate) {
    if (state.emitTimer) clearTimeout(state.emitTimer);
    return emitNow(kind);
  }
  if (!state.emitTimer) state.emitTimer = setTimeout(() => emitNow(kind), EMIT_INTERVAL_MS);
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

function runFinishAction(kind, cfg) {
  logger.info('overlay', `Meta de ${KINDS[kind].label} alcanzada`, { meta: states[kind].goal, actual: states[kind].current, accion: cfg.actionId || null });
  const action = findAction(cfg.actionId);
  if (!action) {
    // Hay una acción elegida pero no se puede usar: borrada, o fuera del límite del plan gratis
    if (cfg.actionId) logger.warn('overlay', `La acción final de la meta de ${KINDS[kind].label} no existe o no está permitida por el plan`, { accion: cfg.actionId });
    return;
  }
  const result = actionDispatcher.dispatch(action, {
    times: 1,
    defaultDelayMs: store.loadSettings().keyDelayMs || 80,
  });
  if (!result.executed) logger.warn('overlay', `La acción final de la meta de ${KINDS[kind].label} no se ejecutó (¿desactivada o sin tecla/sonido?)`, { accion: cfg.actionId, nombre: action.name });
  io?.emit('giftReceived', {
    giftId: `overlay_${kind}_goal`, giftName: `🎯 Meta de ${KINDS[kind].label} alcanzada (${states[kind].goal})`, coins: 0,
    sender: 'Overlay', newCount: 1,
    key: result.label || 'Ninguna', pressed: !!result.executed, timestamp: Date.now(),
  });
}

function checkGoal(kind, silent = false) {
  const state = states[kind];
  const cfg = getConfig(kind);

  // Meta ya superada al sincronizar (p. ej. el directo ya tenía 20.000 y la meta es 5.000):
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

    runFinishAction(kind, cfg);

    if (cfg.onReach === 'increase') state.goal += cfg.goal;
    else if (cfg.onReach === 'double') state.goal *= 2;
    else if (cfg.onReach === 'hide') state.hidden = true;
    else state.reached = true; // keep: se queda al 100% y no vuelve a disparar
  }
}

// silent: salta metas superadas sin disparar acciones.
// force: actúa aunque no haya overlay enlazado (acciones del usuario en el panel); en ese caso
//        nunca se disparan acciones, solo se mueve la barra.
function recompute(kind, { silent = false, force = false } = {}) {
  const state = states[kind];
  if (!state.goal) state.goal = getConfig(kind).goal;
  state.current = state.manual + state.live;

  // Los espectadores suben y bajan: con "Mantener meta" se vuelve a armar si bajan de la meta, para que
  // pueda dispararse otra vez al volver a subir. Aumentar/Duplicar siguen siendo de un solo sentido.
  if (kind === 'viewers' && state.reached && state.current < state.goal) state.reached = false;

  const active = isActive(kind);
  if (!active && !force) return;       // sin enlace: solo cuentas, nada de acciones ni emisiones
  checkGoal(kind, silent || !active);
  scheduleEmit(kind);
}

// Suma manual (botón de probar)
function addManual(kind, count) {
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n <= 0) return;
  states[kind].manual += n;
  recompute(kind, { force: true });
}

// --- Totales de la sala (likes y seguidores) ---
// Las dos metas siguen el total acumulado que informa TikTok y no la suma de eventos: TikTok agrupa y
// descarta mensajes en directos con mucha actividad. `batch` solo sirve para el modo "solo lo nuevo"
// y como respaldo cuando el evento no trae un total fiable.
function applyTotal(kind, rawTotal, batch) {
  const state = states[kind];
  const cfg = getConfig(kind);
  const total = Math.floor(Number(rawTotal));
  if (Number.isFinite(total) && total > 0) {
    // Los likes solo suben: se ignoran totales atrasados (mensajes desordenados). Los seguidores pueden
    // bajar de verdad (alguien deja de seguir), así que se toma siempre el último total.
    if (kind === 'followers' || total > state.lastTotal) state.lastTotal = total;
    // Modo "solo lo nuevo": el primer dato fija el punto de partida (incluyendo sus propios likes/seguidores)
    if (cfg.countMode === 'live' && !state.offsetSet) { state.offset = Math.max(0, total - batch); state.offsetSet = true; }
    state.live = Math.max(0, state.lastTotal - state.offset);
  } else if (state.lastTotal > 0) {
    state.lastTotal += batch;                              // hay base conocida: se sigue sobre ella
    state.live = Math.max(0, state.lastTotal - state.offset);
  } else {
    state.live += batch;
  }
  const firstSync = !state.synced;
  state.synced = true;
  recompute(kind, { silent: firstSync });
}

// Evento 'like'. En tiktok-live-proto v3 (el que usa la librería) los campos son `count` (número) y
// `total` (string); `likeCount`/`totalLikeCount` son de v1 y se aceptan por compatibilidad.
function addLiveLikes(data = {}) {
  const batch = Math.max(0, Math.floor(Number(data.count ?? data.likeCount)) || 0) || 1;
  applyTotal('likes', data.total ?? data.totalLikeCount, batch);
}

// Evento 'follow': `followCount` es el total exacto de seguidores del streamer (comprobado en un directo
// real). Como es un total, repetir el mismo evento no suma dos veces.
function addFollower(data = {}) {
  applyTotal('followers', data.followCount, 1);
}

// Seguidores del streamer conocidos por otra vía (roomInfo): fija el punto de partida, no cuenta como nuevo.
function setFollowerTotal(total) {
  applyTotal('followers', total, 0);
}

// Identificador estable del usuario en un evento 'share'. Comprobado en directos reales: el usuario llega como
// { id, secUid, displayId (@usuario), nickname } y NO trae userId ni uniqueId (otros eventos sí), así que se
// prueban todos los campos conocidos de más a menos estable.
function shareUserKey(data) {
  const u = data.user || {};
  const key = u.id || u.userId || u.secUid || u.displayId || u.uniqueId || data.uniqueId;
  return key ? String(key) : '';
}

// Evento 'share' (alguien compartió el directo). No hay un total fiable de compartidas, así que se cuentan
// eventos desde que se conecta. Con allowMultiple desactivado solo cuenta la primera compartida de cada usuario;
// activado, cada vez que el mismo usuario comparte (p. ej. al copiar el enlace) la meta sube.
function addShare(data = {}) {
  const state = states.shares;
  const cfg = getConfig('shares');
  const key = shareUserKey(data);
  if (key) {
    const already = sharedUsers.has(key);
    if (sharedUsers.size >= MAX_SHARED_USERS) sharedUsers.clear();
    sharedUsers.add(key);
    if (already && !cfg.allowMultiple) return;
  }
  state.lastTotal += 1;
  state.live = Math.max(0, state.lastTotal - state.offset);
  state.synced = true;
  recompute('shares'); // se cuenta desde 0: no hay nada que sincronizar en silencio
}

// Espectadores ACTUALES (no acumulados): sube y baja con la gente que hay en el directo. Viene en el evento
// 'roomUser' (campo `total`, string; `totalUser` en cambio es el acumulado de entradas y no se usa).
function setViewers(rawTotal) {
  const n = Math.floor(Number(rawTotal));
  if (!Number.isFinite(n) || n < 0) return;
  const state = states.viewers;
  state.live = n;
  const firstSync = !state.synced;
  state.synced = true;
  recompute('viewers', { silent: firstSync });
}

// Monedas recibidas en regalos desde que se conecta (suma de monedas por unidad × unidades nuevas).
// No hay un total de monedas fiable del directo, así que se acumula lo que llega por eventos de regalo.
function addCoins(amount) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return;
  const state = states.coins;
  state.lastTotal += n;
  state.live = Math.max(0, state.lastTotal - state.offset);
  state.synced = true;
  recompute('coins'); // se cuenta desde 0: el primer regalo ya puede cruzar la meta y debe disparar
}

// Valor inicial de espectadores desde la conexión (roomInfo.user_count), sin red. Se llama al conectar.
function seedViewers() {
  const n = hooks.viewersNow?.();
  if (n !== null && n !== undefined) setViewers(n);
}

// Toma el total que ya trae la conexión (gratis, sin red). Se llama al conectar.
function seedFollowers() {
  const n = hooks.followerTotalNow?.();
  if (n) setFollowerTotal(n);
}

// Al enlazar un overlay se refresca el total desde TikTok (una petición), por si pasó mucho desde que se
// conectó. Solo con overlay enlazado y directo conectado.
function requestFollowerBaseline() {
  const state = states.followers;
  if (!hooks.fetchFollowerTotal || state.fetching || !isActive('followers')) return;

  state.fetching = true;
  Promise.resolve(hooks.fetchFollowerTotal())
    .then(total => { if (total) setFollowerTotal(total); })
    .catch(() => {})
    .finally(() => { state.fetching = false; });
}

// fromNow=true (botón Reiniciar): la barra vuelve a 0 y cuenta desde el valor actual.
// fromNow=false (nueva conexión / cambio de modo): se descarta todo y el primer dato fija el punto de partida.
function reset(kind, fromNow = false) {
  const state = states[kind];
  const prevLive = state.live;
  state.manual = 0;
  state.live = 0;
  state.current = 0;
  state.offset = fromNow ? state.lastTotal : 0;
  state.offsetSet = fromNow;
  if (!fromNow) { state.lastTotal = 0; state.synced = false; if (kind === 'shares') sharedUsers.clear(); }
  state.goal = getConfig(kind).goal;
  state.reached = false;
  state.hidden = false;
  // Espectadores: Reiniciar no borra la gente que hay en el directo, solo la meta y lo del botón de probar
  if (kind === 'viewers' && fromNow) {
    state.live = prevLive;
    state.current = prevLive;
    checkGoal(kind, true); // ya hay gente por encima de la meta base: se salta a la meta vigente sin disparar acciones
  }
  scheduleEmit(kind, true);
  if (!fromNow && kind === 'followers') seedFollowers(); // ya conectados: se vuelve a tomar el total conocido
  if (!fromNow && kind === 'viewers') seedViewers();
}

const resetAll = () => Object.keys(KINDS).forEach(kind => reset(kind));

// Un overlay real se acaba de enlazar: se sincroniza en silencio con lo contado hasta ahora.
function onLinked(kind) {
  recompute(kind, { silent: true, force: true });
  if (kind === 'followers') requestFollowerBaseline();
}

// ---------- Sockets ----------
function init(ioInstance) {
  io = ioInstance;
  for (const kind of Object.keys(KINDS)) states[kind].goal = getConfig(kind).goal;

  // Se registra cuándo un overlay real (OBS / Live Studio) se enlaza o se cae
  const lastClients = {};
  const broadcastClients = () => {
    for (const kind of Object.keys(KINDS)) {
      const n = clientCount(kind);
      io.emit(`overlay:${kind}:clients`, n);
      const before = lastClients[kind] || 0;
      if (before !== n) {
        // Solo importa cuando se enlaza (0 -> n) o se queda sin enlace (n -> 0); otros cambios son una conexión más o menos
        const text = before === 0 ? 'enlazado' : n === 0 ? 'sin enlace (se desconectó)' : `${n} conexiones`;
        logger.info('overlay', `Overlay de ${KINDS[kind].label}: ${text}`, { conexiones: n });
        lastClients[kind] = n;
      }
    }
  };

  io.on('connection', (socket) => {
    socket.on('overlay:join', ({ name, preview } = {}) => {
      const kind = kindOf(name);
      if (!kind) return;
      if (!preview) {
        const wasActive = isActive(kind);
        socket.join(room(kind));
        broadcastClients();
        if (!wasActive) onLinked(kind);
      }
      socket.emit(`overlay:${kind}:state`, snapshot(kind));
    });
    socket.on('disconnect', broadcastClients);
    for (const kind of Object.keys(KINDS)) socket.emit(`overlay:${kind}:clients`, clientCount(kind));
  });
}

module.exports = {
  init, kinds: Object.keys(KINDS), kindOf,
  getConfig, updateConfig, snapshot, clientCount, isActive,
  addManual, addLiveLikes, addFollower, addShare, addCoins, setViewers, seedViewers, setFollowerTotal, seedFollowers, requestFollowerBaseline,
  reset, resetAll,
  setHooks: (h) => Object.assign(hooks, h),
  fonts: OVERLAY_FONTS,
  defaultStyles: (kind) => DEFAULT_OVERLAYS[kind].styles,
};
