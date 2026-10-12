// backend/services/tiktok/social.js
// Eventos de la audiencia: "share", "follow", "like", "member" (entrar al directo), Super Fan y subida de nivel de fan. Alimentan metas y
// rankings y disparan las reglas de la pestaña Eventos (con su filtro "quién puede activarlo" y su frecuencia por usuario).
const ctx = require('./context');
const { getUsername, rankUser, alertUser, actorOf, findUserDeep, resetActors } = require('./users');
const frequency = require('./frequency');
const eventEngine = require('../eventEngine');
const overlayService = require('../overlayService');
const rankingService = require('../rankingService');

const followedUsers = new Set();     // seguidores ya contados (un follow repetido no vuelve a disparar reglas). No se reinicia al conectar.
const likeAccumulators = {};         // reglaId -> likes acumulados hacia su umbral (solo cuentan los de quien la regla deja pasar). No se reinicia al conectar.
const superFanSeen = new Map();      // usuario -> última vez (TikTok manda varios mensajes de Super Fan por una misma persona)
const SUPER_FAN_DEDUPE_MS = 15000;

function handleShare(data) {
  const username = getUsername(data);
  overlayService.addShare(data);
  rankingService.record('shares', rankUser(data), 1);
  console.log(`📢 ${username} ha compartido el directo`);

  // La frecuencia se decide por regla ('una vez' por usuario por defecto)
  const result = ctx.executeEventActions('share', 'any', 1, { user: alertUser(data) }, { actor: actorOf(data), frequency: 'once' });

  ctx.io.emit('giftReceived', {
    giftId: 'action_share', giftName: '📢 Compartió el Directo', coins: 0, sender: username, newCount: 1,
    key: result.keyExecuted || 'Ninguna', pressed: result.actionExecuted, timestamp: Date.now()
  });
}

function handleFollow(data) {
  const username = getUsername(data);
  // La meta sigue el total (followCount), así que repetir el evento no la afecta; va antes de deduplicar.
  overlayService.addFollower(data);
  if (followedUsers.has(username)) return;
  followedUsers.add(username);

  console.log(`👤 Nuevo seguidor: @${username}`);
  // Quien acaba de seguir es seguidor aunque este evento no traiga su identidad
  const result = ctx.executeEventActions('follow', 'any', 1, { user: alertUser(data) }, { actor: actorOf(data, { follower: true }) });

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
  const actor = actorOf(data);

  eventEngine.getEventsByTrigger('like', actor).forEach(({ evt, actions }) => {
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

// Alguien entra al directo (mensaje "member"). Solo se registra en el Log si alguna regla se ejecutó (entran muchos).
function handleJoin(data) {
  if (Number(data?.action) === 3) return; // 3 = se suscribió, no es una entrada
  const result = ctx.executeEventActions('join', 'any', 1, { user: alertUser(data) }, { actor: actorOf(data), frequency: 'once' });
  if (result.actionExecuted) ctx.emitLog('action_join', '👋 Entró al directo', getUsername(data), result.keyExecuted);
}

// Super Fan (mensajes "superFan" y "superFanJoin"). Estos mensajes no traen el usuario en un campo fijo: se busca dentro del mensaje.
function handleSuperFan(data) {
  const user = findUserDeep(data);
  const holder = user ? { user } : {};
  const actor = actorOf(holder);
  const who = user ? getUsername(holder) : 'alguien';

  const now = Date.now();
  const dedupeKey = actor.key || 'desconocido';
  if (now - (superFanSeen.get(dedupeKey) || 0) < SUPER_FAN_DEDUPE_MS) return;
  superFanSeen.set(dedupeKey, now);
  if (superFanSeen.size > 500) superFanSeen.delete(superFanSeen.keys().next().value);

  const result = ctx.executeEventActions('superfan', 'any', 1, { user: alertUser(holder) }, { actor: actorOf(holder, { subscriber: false }), frequency: 'once' });
  if (result.actionExecuted) ctx.emitLog('action_superfan', '⭐ Nuevo Super Fan', who, result.keyExecuted);
}

// Subida de nivel de fan: llega como mensaje "barrage" de tipo "fans level upgrade" con el nivel alcanzado. Otros "barrage" se ignoran.
function handleBarrage(data) {
  const level = Number(data?.fansLevelParam?.currentGrade);
  if (!(level > 0)) return;
  const holder = { user: data.fansLevelParam.user };
  const actor = actorOf(holder);
  const context = { user: alertUser(holder), fanLevel: level };

  // "Específico" (exactamente ese nivel) y "mínimo" (ese nivel o más) son reglas distintas
  const exact = ctx.executeEventActions('fanlevel', level, 1, context, { actor });
  const min = ctx.executeEventActions('fanlevelmin', level, 1, context, { actor });
  if (exact.actionExecuted || min.actionExecuted) {
    ctx.emitLog('action_fanlevel', `🎖️ Nivel de fan ${level}`, getUsername(holder), [exact.keyExecuted, min.keyExecuted].filter(Boolean).join(' + '));
  }
}

// Al conectar: lo pendiente del directo anterior no cuenta
function reset() {
  superFanSeen.clear();
  frequency.reset(); // "una vez" y enfriamientos por usuario (compartir, entrar, comentar...)
  resetActors();     // roles (seguidor, suscriptor, moderador) recordados de los usuarios
}

module.exports = { handleShare, handleFollow, handleLike, handleJoin, handleSuperFan, handleBarrage, reset };
