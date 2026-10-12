// backend/services/tiktok/chat.js
// Evento "chat": ranking de comentarios, stickers/emotes (con su antispam y enfriamientos) y lectura en voz alta (Bot TTS).
const ctx = require('./context');
const { getUsername, getSpeakableName, rankUser, alertUser, actorOf } = require('./users');
const eventEngine = require('../eventEngine');
const stickersManager = require('../stickersManager');
const rankingService = require('../rankingService');
const chatFilter = require('../chatFilter');

const stickerCooldowns = new Map(); // "reglaId_usuario" -> último disparo (enfriamiento por regla). No se reinicia al conectar.
const stickerUserLast = new Map();  // usuario -> último disparo de cualquier sticker (enfriamiento global del usuario)

function recordStickerUser(userKey) {
  stickerUserLast.set(userKey, Date.now());
  if (stickerUserLast.size > 10000) stickerUserLast.delete(stickerUserLast.keys().next().value);
}

function recordCooldown(key) {
  stickerCooldowns.set(key, Date.now());
  if (stickerCooldowns.size > 10000) {
    stickerCooldowns.delete(stickerCooldowns.keys().next().value);
  }
}

function parseBadges(data) {
  return (data.user?.badgeList || []).map(b => {
    const iconUrl =
      b.combine?.icon?.urlList?.[0] ||
      b.image?.urlList?.[0] ||
      b.icons?.urlList?.[0] ||
      null;

    const label = b.combine?.str || b.label || '';
    const isFans = b.sceneType === 10 || (label && isNaN(Number(label)));
    const isLevel = b.sceneType === 8 || (!isNaN(Number(label)) && label !== '');
    const type = isFans ? 'fans' : isLevel ? 'level' : 'other';

    return { label, iconUrl, type, level: b.privilegeLogExtra?.level || null };
  }).filter(b => b.label || b.iconUrl);
}

// 🎁 STICKERS / EMOTES
function handleStickers(data) {
  const catalog = stickersManager.getCatalog();
  let catalogUpdated = false;

  const antispam = ctx.settings?.stickerAntispam || {};
  const onePerComment = antispam.onePerComment !== false;      // activo por defecto
  const userCooldownMs = antispam.userCooldownMs ?? 6000;      // 0 = sin enfriamiento

  // 1. Registrar en el catálogo, contar repeticiones y recordar el orden de aparición
  const occurrenceCount = {};
  const order = [];
  const emoteMeta = {};

  data.emotes.forEach(emoteWrapper => {
    const emote = emoteWrapper.emote;
    if (!emote) return;
    const emoteId = emote.id || emote.emoteId;
    if (!emoteId || emoteId === '?') return;

    if (occurrenceCount[emoteId] === undefined) order.push(emoteId);
    occurrenceCount[emoteId] = (occurrenceCount[emoteId] || 0) + 1;

    if (!emoteMeta[emoteId]) {
      const emoteName = emote.name || emote.emoteId || 'Sticker';
      const iconUrl = emote.image?.urlList?.[0] || emote.image?.imageList?.[0]?.url || emote.imageUrl || '';
      emoteMeta[emoteId] = { name: emoteName, icon: iconUrl };

      if (!catalog[emoteId]) {
        stickersManager.upsertCatalogEntry(emoteId, emoteMeta[emoteId]);
        catalogUpdated = true;
        console.log(`✅ [CATÁLOGO] Sticker nuevo detectado: ${emoteName}`);
      }
    }
  });

  const senderId = String(data.user?.userId || data.user?.uniqueId || data.uniqueId || 'desconocido');

  // 2. Solo cuentan los stickers que tienen una regla activa, en el orden en que aparecen
  let candidates = order
    .map(emoteId => ({ emoteId, matches: eventEngine.findMatchingEvents('sticker', emoteId) }))
    .filter(c => c.matches.length > 0);

  if (onePerComment) candidates = candidates.slice(0, 1);

  // 3. Enfriamiento global del usuario
  let blockedByCooldown = false;
  if (candidates.length > 0 && userCooldownMs > 0) {
    const last = stickerUserLast.get(senderId);
    if (last && Date.now() - last < userCooldownMs) blockedByCooldown = true;
  }

  if (candidates.length > 0 && !blockedByCooldown) {
    if (userCooldownMs > 0) recordStickerUser(senderId);

    candidates.forEach(({ emoteId, matches }) => {
      const countInMessage = occurrenceCount[emoteId];

      matches.forEach(({ evt, actions }) => {
        const repeatMode = evt.repeatMode || 'once';

        let timesToTrigger = 1;
        let playbackStyle = 'sequential';

        if (repeatMode === 'all') {
          timesToTrigger = countInMessage;
        } else if (repeatMode === 'limited') {
          timesToTrigger = Math.min(countInMessage, evt.repeatLimit || 1);
          playbackStyle = evt.playbackStyle === 'simultaneous' ? 'simultaneous' : 'sequential';
        }

        const cooldownSeconds = evt.cooldownSeconds || 0;
        if (cooldownSeconds > 0 && !eventEngine.eventIsSoundOnly(evt, actions)) {
          const cooldownKey = `${evt.id}_${senderId}`;
          const last = stickerCooldowns.get(cooldownKey);
          if (last && (Date.now() - last) < cooldownSeconds * 1000) return;
          recordCooldown(cooldownKey);
        }

        const result = eventEngine.runEvent(evt, actions, {
          times: timesToTrigger,
          defaultDelayMs: ctx.defaultDelayMs(),
          playbackStyle,
          context: { user: alertUser(data), comment: String(data.comment || data.content || '').trim() },
        });
        if (result.executed) {
          console.log(`🎯 [STICKER] "${result.label}" x${timesToTrigger} (${emoteMeta[emoteId]?.name || emoteId})`);
        }
      });
    });
  } else if (blockedByCooldown) {
    console.log(`⏳ [STICKER] @${senderId} en enfriamiento (${userCooldownMs} ms)`);
  }

  if (catalogUpdated) {
    ctx.io.emit('catalog:newSticker', stickersManager.getCatalog());
  }
}

// 🔊 Bot TTS: filtros (seguidores, fans, prefijo, idioma, antispam) y texto a leer
function handleTTS(data, badges) {
  const tts = ctx.settings.tts;
  if (!tts || !tts.enabled) return;

  const identity = data.userIdentity || {};
  const isFollower = identity.isFollowerOfAnchor;
  const isMod = identity.isModeratorOfAnchor;
  const isAnchor = identity.isAnchor;
  const username = getUsername(data);
  const speakableName = getSpeakableName(data);
  const nameIsBlocked = tts.profanityFilter && chatFilter.findBlockedTerm(speakableName, tts.blockedTerms);

  const fanBadge = badges.find(b => b.type === 'fans');
  const donatorBadge = badges.find(b => b.type === 'level');

  const isFanClub = !!fanBadge;
  const fanLevel = fanBadge && fanBadge.level ? parseInt(fanBadge.level, 10) : 0;

  const isDonator = !!donatorBadge;
  const donatorLevel = donatorBadge && donatorBadge.level ? parseInt(donatorBadge.level, 10) : 0;

  const filterMode = tts.filterMode || 'all';
  if (filterMode === 'followers' && !isFollower && !isFanClub && !isMod && !isAnchor) return;
  if (filterMode === 'fans' && !isFanClub && !isMod && !isAnchor) return;
  if (filterMode === 'fans' && tts.minFanLevel && fanLevel < tts.minFanLevel && !isMod && !isAnchor) return;

  let commentText = (data.comment || data.content || '').trim();
  if (!commentText) return;

  if (tts.usePrefix && tts.prefixText) {
    const lowerComment = commentText.toLowerCase();
    const prefix = tts.prefixText.trim();
    if (!lowerComment.startsWith(prefix)) return;
    commentText = commentText.slice(prefix.length).trim();
    if (!commentText) return;
  }

  if (tts.onlyLatin) {
    const containsWeirdChars = /[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\p{M}]/u.test(commentText);
    if (containsWeirdChars) {
      console.log(`🚫 Comentario ignorado por filtro de idioma: ${commentText}`);
      return;
    }
  }

  const userKey = String(data.user?.userId || data.user?.uniqueId || data.uniqueId || username);
  const verdict = chatFilter.evaluateMessage({
    userKey,
    text: commentText,
    tts,
    exempt: isMod || isAnchor
  });
  if (!verdict.allowed) {
    console.log(`🚫 [TTS] @${username} omitido (${verdict.reason}): ${commentText}`);
    return;
  }

  const maxChars = tts.maxChars || 150;
  if (commentText.length > maxChars) commentText = commentText.slice(0, maxChars) + '...';

  const clearedName = (nameIsBlocked ? '' : speakableName).replace(/[_.-]/g, ' ').trim();
  const clearedComment = commentText.replace(/[_.-]/g, ' ').trim();
  const textToSay = (tts.sayUsername && clearedName) ? `${clearedName} dice: ${clearedComment}` : clearedComment;

  ctx.io.emit('ttsComment', {
    username, comment: commentText, text: textToSay,
    isFanClub, fanLevel, isDonator, donatorLevel, isMod, badges,
    timestamp: Date.now()
  });
}

// Reglas de comentarios: "chat" (cualquier comentario) y "chattext" (un comentario concreto). Solo se registra en el Log si alguna regla se ejecutó.
function handleChatTriggers(data) {
  const comment = String(data.comment || data.content || '').trim();
  if (!comment) return;
  const actor = actorOf(data);
  const context = { user: alertUser(data), comment };
  const labels = [];
  for (const [trigger, value] of [['chat', 'any'], ['chattext', comment]]) {
    const result = ctx.executeEventActions(trigger, value, 1, context, { actor, frequency: 'always' });
    if (result.actionExecuted && result.keyExecuted) labels.push(result.keyExecuted);
  }
  if (labels.length) ctx.emitLog('action_chat', '💬 Comentario', getUsername(data), labels.join(' + '));
}

function handleChat(data) {
  rankingService.record('comments', rankUser(data), 1);
  actorOf(data); // recuerda los roles de quien comenta (los usan los filtros de entradas, likes... que no traen identidad)
  const badges = parseBadges(data);
  handleChatTriggers(data);
  if (data.emotes && data.emotes.length > 0) handleStickers(data);
  handleTTS(data, badges);
}

// Al conectar: el enfriamiento global de stickers por usuario empieza de cero
function reset() {
  stickerUserLast.clear();
}

module.exports = { handleChat, reset };
