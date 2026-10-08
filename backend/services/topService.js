// backend/services/topService.js
// Overlays "mejor regalo" y "mejor combo" del directo actual. NINGUNO es acumulativo: muestran una sola ráfaga.
//   topgift:  el regalo de MAYOR VALOR por unidad (p. ej. un Capibara) con la cantidad de su ráfaga ("x30").
//             Solo lo reemplaza un regalo de más valor; 100 rosas no desplazan a un capibara.
//             Si empatan en valor, gana la ráfaga con más unidades.
//   topcombo: la ráfaga con MÁS UNIDADES seguidas (lo que TikTok muestra como "x100"); una sola unidad (x1) ya cuenta, para que el público vea algo desde el primer regalo.
//             Si empatan, gana el regalo de más valor.
// NO se reinician al desconectar/reconectar (una caída de conexión no debe borrar el combo del directo): solo al cerrar la app,
// al cambiar de usuario (otro directo) o con el botón de reinicio. Opción `keepOnClose`: guarda el líder en overlays.json
// (clave `topSaved`) para conservarlo aunque se cierre la app.
// Una "ráfaga" es una racha identificada por su groupId (ver giftStreaks.js). Mientras la racha de quien lidera
// sigue creciendo, el valor se actualiza en vivo; si otra la supera, pasa a ser la nueva líder.
//
// Igual que las metas: los datos se llevan siempre (es barato), pero solo se emiten al overlay y se registran
// cambios cuando hay un overlay real enlazado (OBS / Live Studio).
const store = require('../data/store');
const logger = require('./logger');
const { DEFAULT_OVERLAYS, OVERLAY_FONTS } = require('../data/defaults');

// score = [criterio principal, desempate]; gana quien tenga un score estrictamente mayor
const KINDS = {
  topgift: { label: 'mejor regalo', score: (units, perUnit) => [perUnit, units], minUnits: 1 },
  topcombo: { label: 'mejor combo', score: (units, perUnit) => [units, perUnit], minUnits: 1 },
};
const better = (a, b) => (a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1]);
const sameScore = (a, b) => a[0] === b[0] && a[1] === b[1];
const VALUE_MODES = ['unit', 'count', 'coins', 'both'];
const STYLE_IDS = [1, 2, 3];
const EMIT_INTERVAL_MS = 120;

let io = null;
const states = {
  topgift: { best: null, emitTimer: null },
  topcombo: { best: null, emitTimer: null },
};
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
    nameOverIcon: !!m.nameOverIcon,
    keepOnClose: !!m.keepOnClose,
    // 'count' era el modo por defecto anterior (mostraba 101 con 101 rosas); en el mejor regalo ahora se muestra el valor del regalo ('unit')
    valueMode: VALUE_MODES.includes(m.valueMode) ? (kind === 'topgift' && m.valueMode === 'count' ? 'unit' : m.valueMode) : d.valueMode,
    accentColor: hex('accentColor'),
    titleColor: hex('titleColor'),
    nameColor: hex('nameColor'),
    valueColor: hex('valueColor'),
    cardColor: hex('cardColor'),
    showTitle: !!m.showTitle,
    showIcon: !!m.showIcon,
    showUser: !!m.showUser,
    userField: m.userField === 'username' ? 'username' : 'nickname',
    animate: !!m.animate,
  };
}

const configCache = {};
function getConfig(kind) {
  if (!configCache[kind]) configCache[kind] = sanitize(kind, store.loadOverlays()[kind] || {}, DEFAULT_OVERLAYS[kind]);
  return configCache[kind];
}

function updateConfig(kind, patch) {
  const before = getConfig(kind).keepOnClose;
  const next = sanitize(kind, patch, getConfig(kind));
  store.saveOverlays({ ...store.loadOverlays(), schemaVersion: 1, [kind]: next });
  configCache[kind] = next;
  if (next.keepOnClose !== before) persist(kind, true);
  scheduleEmit(kind, true);
  return next;
}

// ---------- Estado ----------
let owner = null; // usuario del directo al que pertenecen los líderes actuales
const saveTimers = {};

// Guarda (o borra, si la opción está apagada) el líder de este tipo. Con debounce: la ráfaga líder cambia varias veces por segundo.
function persist(kind, now = false) {
  clearTimeout(saveTimers[kind]);
  const write = () => {
    try {
      const all = store.loadOverlays();
      const saved = { ...(all.topSaved || {}) };
      if (getConfig(kind).keepOnClose) saved[kind] = { owner, best: states[kind].best };
      else delete saved[kind];
      store.saveOverlays({ ...all, topSaved: saved });
    } catch (e) { logger.warn('overlay', 'No se pudo guardar el líder de ' + KINDS[kind].label, { error: e.message }); }
  };
  if (now) write(); else { saveTimers[kind] = setTimeout(write, 2000); if (saveTimers[kind].unref) saveTimers[kind].unref(); }
}

// Al arrancar: recupera los líderes guardados (solo de los tipos con la opción activa)
function restoreSaved() {
  const saved = store.loadOverlays().topSaved || {};
  for (const kind of Object.keys(KINDS)) {
    if (!getConfig(kind).keepOnClose || !saved[kind]?.best) continue;
    states[kind].best = saved[kind].best;
    owner = saved[kind].owner || owner;
  }
}

// Se llama al conectar. Reconectar al MISMO usuario conserva todo; otro usuario es otro directo y empieza de cero.
function setOwner(username) {
  const name = String(username || '').replace(/^@/, '').toLowerCase() || null;
  if (!name) return;
  if (owner && owner !== name) resetAll();
  owner = name;
}

const room = (kind) => `overlay:${kind}`;
const clientCount = (kind) => io?.sockets.adapter.rooms.get(room(kind))?.size || 0;
const isActive = (kind) => clientCount(kind) > 0;
// Vistas previas abiertas del panel: no cuentan como enlace, pero mientras alguna está abierta se le emite el estado en vivo
const previewRoom = (kind) => `overlay-preview:${kind}`;
const hasPreview = (kind) => (io?.sockets.adapter.rooms.get(previewRoom(kind))?.size || 0) > 0;

function snapshot(kind) {
  const cfg = getConfig(kind);
  const b = states[kind].best;
  return {
    kind,
    config: cfg,
    best: b && {
      gift: b.gift,
      user: { name: b.user.nickname || b.user.username || '', username: b.user.username || '', nickname: b.user.nickname || '' },
      units: b.units,
      coins: b.coins,
      perUnit: b.perUnit,
    },
  };
}

function emitNow(kind) {
  states[kind].emitTimer = null;
  io?.emit(`overlay:${kind}:state`, snapshot(kind));
}

function scheduleEmit(kind, immediate = false) {
  const st = states[kind];
  if (immediate) {
    if (st.emitTimer) clearTimeout(st.emitTimer);
    return emitNow(kind);
  }
  if (!st.emitTimer) st.emitTimer = setTimeout(() => emitNow(kind), EMIT_INTERVAL_MS);
}

// ---------- Registro de regalos ----------
// ev: { key, giftId, giftName, icon, perUnit, units, user: { id, nickname, username } }
//   key   = identificador de la ráfaga (giftStreaks); units = unidades acumuladas de esa ráfaga hasta ahora.
function record(ev) {
  const units = Math.floor(Number(ev.units));
  const perUnit = Math.max(0, Math.floor(Number(ev.perUnit)) || 0);
  if (!(units >= 1) || !ev.key) return;

  for (const kind of Object.keys(KINDS)) {
    const def = KINDS[kind];
    if (units < def.minUnits) continue;
    const st = states[kind];
    const score = def.score(units, perUnit);
    const b = st.best;

    if (b && b.key === ev.key) {
      // La ráfaga líder sigue creciendo
      if (sameScore(score, b.score)) continue;
      b.units = units; b.coins = units * perUnit; b.score = score;
    } else if (!b || better(score, b.score)) {
      st.best = {
        key: ev.key, score, units, perUnit, coins: units * perUnit,
        gift: { id: String(ev.giftId), name: ev.giftName || `Regalo ${ev.giftId}`, icon: ev.icon || '' },
        user: { id: ev.user?.id || '', nickname: ev.user?.nickname || '', username: ev.user?.username || '' },
      };
      logger.debug('overlay', `Nuevo ${def.label}`, { regalo: ev.giftName, unidades: units, valorUnitario: perUnit, usuario: ev.user?.username });
    } else {
      continue;
    }
    persist(kind);
    if (isActive(kind) || hasPreview(kind)) scheduleEmit(kind);
  }
}

// Datos de ejemplo para el botón "Probar" del panel (no depende de que haya un directo).
function test(kind) {
  const units = kind === 'topcombo' ? 24 + Math.floor(Math.random() * 76) : 10 + Math.floor(Math.random() * 40);
  const perUnit = kind === 'topgift' ? 20 : 1;
  states[kind].best = {
    key: 'test', score: KINDS[kind].score(units, perUnit), units, perUnit, coins: units * perUnit,
    gift: { id: 'test', name: 'Rose', icon: '' },
    user: { id: 'test', nickname: 'Usuario de prueba', username: 'usuario_prueba' },
  };
  scheduleEmit(kind, true);
}

function reset(kind) {
  states[kind].best = null;
  persist(kind);
  scheduleEmit(kind, true);
}
const resetAll = () => Object.keys(KINDS).forEach(reset);

// ---------- Sockets ----------
function init(ioInstance) {
  io = ioInstance;
  restoreSaved();
  const lastClients = {};
  const broadcastClients = () => {
    for (const kind of Object.keys(KINDS)) {
      const n = clientCount(kind);
      io.emit(`overlay:${kind}:clients`, n);
      const before = lastClients[kind] || 0;
      if (before !== n) {
        logger.info('overlay', `Overlay de ${KINDS[kind].label}: ${before === 0 ? 'enlazado' : n === 0 ? 'sin enlace (se desconectó)' : `${n} conexiones`}`, { conexiones: n });
        lastClients[kind] = n;
      }
    }
  };

  io.on('connection', (socket) => {
    // Comparte el evento 'overlay:join' con las metas: cada servicio atiende solo sus propios nombres
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

module.exports = {
  init, setOwner, kinds: Object.keys(KINDS), kindOf,
  getConfig, updateConfig, snapshot, clientCount, isActive,
  record, test, reset, resetAll,
  fonts: OVERLAY_FONTS,
  defaultConfig: (kind) => DEFAULT_OVERLAYS[kind],
};
