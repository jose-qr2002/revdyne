// backend/services/topService.js
// Overlays "mejor regalo" y "mejor combo" del directo actual. NINGUNO es acumulativo: muestran una sola ráfaga.
//   topgift:  el regalo de MAYOR VALOR por unidad (p. ej. un Capibara) con la cantidad de su ráfaga ("x30").
//             Solo lo reemplaza un regalo de más valor; 100 rosas no desplazan a un capibara.
//             Si empatan en valor, gana la ráfaga con más unidades.
//   topcombo: la ráfaga con MÁS UNIDADES seguidas (lo que TikTok muestra como "x100"); mínimo 2 para ser un combo.
//             Si empatan, gana el regalo de más valor.
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
  topcombo: { label: 'mejor combo', score: (units, perUnit) => [units, perUnit], minUnits: 2 },
};
const better = (a, b) => (a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1]);
const sameScore = (a, b) => a[0] === b[0] && a[1] === b[1];
const VALUE_MODES = ['count', 'coins', 'both'];
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
    valueMode: VALUE_MODES.includes(m.valueMode) ? m.valueMode : d.valueMode,
    transparentTitle: !!m.transparentTitle,
    transparentValue: !!m.transparentValue,
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
  const next = sanitize(kind, patch, getConfig(kind));
  store.saveOverlays({ ...store.loadOverlays(), schemaVersion: 1, [kind]: next });
  configCache[kind] = next;
  scheduleEmit(kind, true);
  return next;
}

// ---------- Estado ----------
const room = (kind) => `overlay:${kind}`;
const clientCount = (kind) => io?.sockets.adapter.rooms.get(room(kind))?.size || 0;
const isActive = (kind) => clientCount(kind) > 0;

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
    if (isActive(kind)) scheduleEmit(kind);
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
  scheduleEmit(kind, true);
}
const resetAll = () => Object.keys(KINDS).forEach(reset);

// ---------- Sockets ----------
function init(ioInstance) {
  io = ioInstance;
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
      if (!preview) { socket.join(room(kind)); broadcastClients(); }
      socket.emit(`overlay:${kind}:state`, snapshot(kind));
    });
    socket.on('disconnect', broadcastClients);
    for (const kind of Object.keys(KINDS)) socket.emit(`overlay:${kind}:clients`, clientCount(kind));
  });
}

module.exports = {
  init, kinds: Object.keys(KINDS), kindOf,
  getConfig, updateConfig, snapshot, clientCount, isActive,
  record, test, reset, resetAll,
  fonts: OVERLAY_FONTS,
  defaultConfig: (kind) => DEFAULT_OVERLAYS[kind],
};
