// backend/services/tiktok/social.js
// Eventos "share", "follow" y "like": metas, rankings y reglas de compartir (con su frecuencia), seguir y metas de likes.
const ctx = require('./context');
const { getUsername, rankUser, alertUser } = require('./users');
const eventEngine = require('../eventEngine');
const overlayService = require('../overlayService');
const rankingService = require('../rankingService');

const followedUsers = new Set();     // seguidores ya contados (un follow repetido no vuelve a disparar reglas). No se reinicia al conectar.
const onceSeen = new Set();          // "reglaId_usuario" ya ejecutados (modo "una vez")
const eventCooldowns = new Map();    // "reglaId_usuario" -> último disparo (modo "enfriamiento")
const likeAccumulators = {};         // reglaId -> likes acumulados hacia su umbral. No se reinicia al conectar.

// Frecuencia de una regla de compartir para un usuario: siempre, una vez por directo o con enfriamiento
function passesFrequency(evt, userKey) {
  const mode = evt.frequency || 'once';
  if (mode === 'always') return true;

  const key = `${evt.id}_${userKey}`;

  if (mode === 'once') {
    if (onceSeen.has(key)) return false;
    onceSeen.add(key);
    return true;
  }

  if (mode === 'cooldown') {
    const last = eventCooldowns.get(key);
    if (last && Date.now() - last < (evt.cooldownSeconds || 0) * 1000) return false;
    eventCooldowns.set(key, Date.now());
    if (eventCooldowns.size > 10000) eventCooldowns.delete(eventCooldowns.keys().next().value);
    return true;
  }

  return true;
}

function handleShare(data) {
  const username = getUsername(data);
  overlayService.addShare(data);
  rankingService.record('shares', rankUser(data), 1);
  console.log(`📢 ${username} ha compartido el directo`);

  let executed = false;
  let label = null;

  // La frecuencia se decide por regla, no globalmente
  eventEngine.findMatchingEvents('share', 'any').forEach(({ evt, actions }) => {
    if (!passesFrequency(evt, username)) return;
    const result = eventEngine.runEvent(evt, actions, {
      times: 1,
      defaultDelayMs: ctx.defaultDelayMs(),
      context: { user: alertUser(data) },
    });
    if (result.executed) { executed = true; label = label ? `${label} + ${result.label}` : result.label; }
  });

  ctx.io.emit('giftReceived', {
    giftId: 'action_share', giftName: '📢 Compartió el Directo', coins: 0, sender: username, newCount: 1,
    key: label || 'Ninguna', pressed: executed, timestamp: Date.now()
  });
}

function handleFollow(data) {
  const username = getUsername(data);
  // La meta sigue el total (followCount), así que repetir el evento no la afecta; va antes de deduplicar.
  overlayService.addFollower(data);
  if (followedUsers.has(username)) return;
  followedUsers.add(username);

  console.log(`👤 Nuevo seguidor: @${username}`);
  const result = ctx.executeEventActions('follow', 'any', 1, { user: alertUser(data) });

  ctx.io.emit('giftReceived', {
    giftId: 'action_follow', giftName: '👤 Nuevo Seguidor', coins: 0, sender: username, newCount: 1,
    key: result.keyExecuted || 'Ninguna', pressed: result.actionExecuted, timestamp: Date.now()
  });
}

function handleLike(data) {
  overlayService.addLiveLikes(data);
  rankingService.record('likes', rankUser(data), data.count || 1);

  const count = data.count || 1;
  const username = getUsername(data) === 'alguien' ? 'Comunidad' : getUsername(data);

  const likeEvents = eventEngine.getEventsByTrigger('like');

  likeEvents.forEach(({ evt, actions }) => {
    const threshold = parseInt(evt.condition, 10);
    if (!threshold || threshold <= 0) return;

    if (likeAccumulators[evt.id] === undefined) likeAccumulators[evt.id] = 0;
    likeAccumulators[evt.id] += count;

    if (likeAccumulators[evt.id] >= threshold) {
      const timesToTrigger = Math.floor(likeAccumulators[evt.id] / threshold);
      likeAccumulators[evt.id] %= threshold;

      const result = eventEngine.runEvent(evt, actions, {
        times: timesToTrigger,
        defaultDelayMs: ctx.defaultDelayMs(),
        context: { user: alertUser(data), likeCount: count, totalLikeCount: data.total },
      });

      ctx.io.emit('giftReceived', {
        giftId: `like_${threshold}`, giftName: `❤️ Meta de ${threshold} Likes`, coins: 0, sender: username, newCount: timesToTrigger,
        key: result.label || 'Ninguna', pressed: result.executed, timestamp: Date.now()
      });
    }
  });
}

// Al conectar: la frecuencia "una vez" y los enfriamientos de compartir empiezan de cero en cada directo
function reset() {
  onceSeen.clear();
  eventCooldowns.clear();
}

module.exports = { handleShare, handleFollow, handleLike, reset };
