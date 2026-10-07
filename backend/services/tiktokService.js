const { TikTokLiveConnection } = require('tiktok-live-connector');
const stickersManager = require('./stickersManager');
const catalogService = require('./catalogService');
const eventEngine = require('./eventEngine');
const actionDispatcher = require('./actionDispatcher');
const stickerCatalogService = require('./stickerCatalogService');
const store = require('../data/store');
const { findSecUidDeep } = require('./secUidUtils');
const secUidResolver = require('./secUidResolver'); // agregar arriba
const chatFilter = require('./chatFilter');
const overlayService = require('./overlayService');

// ==========================================
// 1. ESTADO GLOBAL DEL SERVICIO
// ==========================================
let tiktokConnection = null;
let isConnected = false;
let ioInstance = null;
let settingsRef = null; // antes "configRef" — ahora solo trae username/keyDelayMs/tts

const streakTracker = {};
const followedUsers = new Set();
const stickerCooldowns = new Map();
const onceSeen = new Set();          // "reglaId_usuario" ya ejecutados (modo "una vez")
const eventCooldowns = new Map();    // "reglaId_usuario" -> último disparo (modo "enfriamiento")
const likeAccumulators = {};
const stickerUserLast = new Map(); // usuario -> último disparo de cualquier sticker

function init(io, settings) {
  ioInstance = io;
  settingsRef = settings;
  // Seguidores del streamer: roomInfo.data.owner.follow_info.follower_count (exacto, igual que el
  // followCount de los eventos follow). followerTotalNow no usa red; fetchFollowerTotal refresca.
  const followerTotalFrom = (info) => Number(info?.data?.owner?.follow_info?.follower_count) || null;
  overlayService.setHooks({
    followerTotalNow: () => (isConnected ? followerTotalFrom(tiktokConnection?.roomInfo) : null),
    fetchFollowerTotal: async () => {
      if (!isConnected || !tiktokConnection) return null;
      try { return followerTotalFrom(await tiktokConnection.fetchRoomInfo()); } catch { return null; }
    },
  });
}

// ==========================================
// 2. MOTOR CENTRAL DE EVENTOS
// ==========================================
function executeEventActions(triggerType, conditionValue, times = 1) {
  const matches = eventEngine.findMatchingEvents(triggerType, conditionValue);

  let actionExecuted = false;
  let keyExecuted = null;

  matches.forEach(({ evt, actions }) => {
    const action = actions[evt.actionId];
    const result = actionDispatcher.dispatch(action, {
      times,
      io: ioInstance,
      defaultDelayMs: settingsRef?.keyDelayMs || 80,
    });
    if (result.executed) {
      actionExecuted = true;
      keyExecuted = result.label;
    }
  });

  return { actionExecuted, keyExecuted };
}

function recordStickerUser(userKey) {
  stickerUserLast.set(userKey, Date.now());
  if (stickerUserLast.size > 10000) stickerUserLast.delete(stickerUserLast.keys().next().value);
}

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

const getUsername = (data) => (data.user?.displayId) || data.uniqueId || (data.user?.nickname) || 'alguien';

function normalizeForSpeech(str) {
  if (!str) return '';
  return str
    .normalize('NFKC')                          // 𝓒𝓸𝓸𝓵 → Cool (arregla fuentes estilizadas)
    .replace(/\p{Extended_Pictographic}/gu, '')  // quita emojis
    .trim();
}

function isSpeakable(normalizedStr) {
  if (!normalizedStr) return false;
  const letters = normalizedStr.match(/\p{L}|\p{N}/gu) || [];
  // al menos un tercio del texto debe ser letras/números reales
  return letters.length > 0 && (letters.length / normalizedStr.length) >= 0.34;
}

function getSpeakableName(data) {
  const nickname = data.user?.nickname;
  const fallbackUsername = data.user?.displayId || data.uniqueId || 'alguien';

  if (nickname) {
    const normalized = normalizeForSpeech(nickname);
    if (isSpeakable(normalized)) {
      return normalized;
    }
  }
  return fallbackUsername;
}

  function recordCooldown(key) {
    stickerCooldowns.set(key, Date.now());
    if (stickerCooldowns.size > 10000) {
      stickerCooldowns.delete(stickerCooldowns.keys().next().value);
    }
  }

async function ensureRoomInfoWithRetry(connection, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const secUid = findSecUidDeep(connection.roomInfo);
    if (secUid) return secUid;

    console.warn(`⚠️ [ROOMINFO] Intento ${attempt}/${maxAttempts} sin sec_uid (status_code: ${connection.roomInfo?.status_code || 'desconocido'}), reintentando...`);
    try {
      await connection.fetchRoomInfo();
    } catch (e) {
      console.warn(`⚠️ [ROOMINFO] fetchRoomInfo() falló: ${e.message}`);
    }
  }
  return findSecUidDeep(connection.roomInfo);
}

// ==========================================
// 3. CONTROLADORES DE EVENTOS DE TIKTOK
// ==========================================

function handleGift(data) {
  const giftObj = data.gift || {};
  const giftId = String(data.giftId);
  const giftName = giftObj.name || `Gift #${giftId}`;
  const coins = giftObj.diamondCount || 0;
  const sender = getUsername(data);
  const giftIcon = giftObj.icon?.urlList?.[0] || giftObj.image?.urlList?.[0] || data.pictureUrl || '';

  catalogService.ensureGiftRegistered(giftId, { name: giftName, coins, icon: giftIcon });

  let newCount = 1;
  const giftType = giftObj.type || data.giftType || 0;

  if (giftType === 1) {
    const streakKey = `${sender}_${giftId}`;
    const isEnd = data.repeatEnd === 1 || data.repeatEnd === true;
    const currentRepeat = data.repeatCount || 1;
    const prev = streakTracker[streakKey] || 0;

    newCount = currentRepeat - prev;

    if (!isEnd) streakTracker[streakKey] = currentRepeat;
    else delete streakTracker[streakKey];

    if (newCount <= 0) return;
  }

  if (coins < (settingsRef?.minCoins || 0)) return;

  const result = executeEventActions('gift', giftId, newCount);

  ioInstance.emit('giftReceived', {
    giftId, giftName, coins, sender, newCount,
    key: result.keyExecuted || 'Ninguna',
    pressed: result.actionExecuted,
    timestamp: Date.now()
  });
}

function handleShare(data) {
  const username = getUsername(data);
  overlayService.addShare(data);
  console.log(`📢 ${username} ha compartido el directo`);

  let executed = false;
  let label = null;

  // La frecuencia se decide por regla, no globalmente
  eventEngine.findMatchingEvents('share', 'any').forEach(({ evt, actions }) => {
    if (!passesFrequency(evt, username)) return;
    const result = actionDispatcher.dispatch(actions[evt.actionId], {
      times: 1,
      defaultDelayMs: settingsRef?.keyDelayMs || 80,
    });
    if (result.executed) { executed = true; label = result.label; }
  });

  ioInstance.emit('giftReceived', {
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
  const result = executeEventActions('follow', 'any', 1);

  ioInstance.emit('giftReceived', {
    giftId: 'action_follow', giftName: '👤 Nuevo Seguidor', coins: 0, sender: username, newCount: 1,
    key: result.keyExecuted || 'Ninguna', pressed: result.actionExecuted, timestamp: Date.now()
  });
}

function handleLike(data) {
  overlayService.addLiveLikes(data);

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

      const action = actions[evt.actionId];
      const result = actionDispatcher.dispatch(action, {
        times: timesToTrigger,
        io: ioInstance,
        defaultDelayMs: settingsRef?.keyDelayMs || 80,
      });

      ioInstance.emit('giftReceived', {
        giftId: `like_${threshold}`, giftName: `❤️ Meta de ${threshold} Likes`, coins: 0, sender: username, newCount: timesToTrigger,
        key: result.label || 'Ninguna', pressed: result.executed, timestamp: Date.now()
      });
    }
  });
}

function handleChat(data) {
  const badges = (data.user?.badgeList || []).map(b => {
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

  // 🎁 STICKERS / EMOTES
  if (data.emotes && data.emotes.length > 0) {
    const catalog = stickersManager.getCatalog();
    let catalogUpdated = false;

    const antispam = settingsRef?.stickerAntispam || {};
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
          const action = actions[evt.actionId];
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
          if (cooldownSeconds > 0 && action?.type !== 'sound') {
            const cooldownKey = `${evt.id}_${senderId}`;
            const last = stickerCooldowns.get(cooldownKey);
            if (last && (Date.now() - last) < cooldownSeconds * 1000) return;
            recordCooldown(cooldownKey);
          }

          const result = actionDispatcher.dispatch(action, {
            times: timesToTrigger,
            defaultDelayMs: settingsRef?.keyDelayMs || 80,
            playbackStyle,
          });
          if (result.executed) {
            console.log(`🎯 [STICKER] "${action.name}" x${timesToTrigger} (${emoteMeta[emoteId]?.name || emoteId})`);
          }
        });
      });
    } else if (blockedByCooldown) {
      console.log(`⏳ [STICKER] @${senderId} en enfriamiento (${userCooldownMs} ms)`);
    }

    if (catalogUpdated) {
      ioInstance.emit('catalog:newSticker', stickersManager.getCatalog());
    }
  }

  // 🔊 TTS (sin cambios respecto a tu versión original)
  const tts = settingsRef.tts;
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

  ioInstance.emit('ttsComment', {
    username, comment: commentText, text: textToSay,
    isFanClub, fanLevel, isDonator, donatorLevel, isMod, badges,
    timestamp: Date.now()
  });
}

// ==========================================
// 4. GESTIÓN DE CONEXIÓN (sin cambios)
// ==========================================
function getCurrentSecUid() {
  return findSecUidDeep(tiktokConnection?.roomInfo);
}

function connect(username) {
  if (tiktokConnection) disconnect();
  
  stickerUserLast.clear();
  onceSeen.clear();
  eventCooldowns.clear();
  overlayService.resetAll();
  
  if (!username) {
    ioInstance.emit('status', { connected: false, message: 'Sin usuario configurado' });
    return;
  }

  console.log(`\n🔄 Conectando a @${username}...`);
  ioInstance.emit('status', { connected: false, message: `Conectando a @${username}...` });

  tiktokConnection = new TikTokLiveConnection(username, { processInitialData: false,  });

  tiktokConnection.connect().then(async state => {
    isConnected = true;
    console.log(`✅ Conectado a @${username} | Room ID: ${state.roomId}`);
    ioInstance.emit('status', { connected: true, message: `✅ Conectado a @${username}`, roomId: state.roomId, username });

    

    // La meta de seguidores arranca con los que ya tiene el streamer (viene en roomInfo, sin otra petición).
    overlayService.seedFollowers();

    const secUid = await ensureRoomInfoWithRetry(tiktokConnection);
    if (secUid) secUidResolver.saveSecUid(username, secUid);
    /*if (secUid) {
      try {
        const freshSettings = store.loadSettings();
        const entries = await stickerCatalogService.fetchStickerCatalog(secUid, freshSettings.tiktokAuth);
        const { catalog, added } = stickersManager.upsertManyCatalogEntries(entries);
        console.log(`🎴 [STICKERS] Catálogo sincronizado: ${entries.length} encontrados (${added} nuevos)`);
        ioInstance.emit('catalog:newSticker', catalog);
      } catch (e) {
        console.warn('⚠️ [STICKERS] No se pudo sincronizar automáticamente, sigue la detección reactiva:', e.message);
      }
    } else {
      console.warn('⚠️ [STICKERS] roomInfo no trajo sec_uid, sigue la detección reactiva');
    }*/
  }).catch(err => {
    console.error('❌ Error de conexión:', err.message);
    ioInstance.emit('status', { connected: false, message: `❌ Error: ${err.message}` });
  });

  tiktokConnection.on('gift', handleGift);
  tiktokConnection.on('share', handleShare);
  tiktokConnection.on('follow', handleFollow);
  tiktokConnection.on('like', handleLike);
  tiktokConnection.on('chat', handleChat);

  tiktokConnection.on('disconnected', (state) => {
    isConnected = false;
    console.log('🔌 Desconectado de TikTok Live');
    ioInstance.emit('status', { connected: false, message: '🔌 Desconectado' });
  });

  tiktokConnection.on('error', err => {
    console.error('❌ Error TikTok:', err.message);
    ioInstance.emit('error', { message: err.message });
  });
  
  
}

function disconnect() {
  if (tiktokConnection) {
    tiktokConnection.disconnect();
    tiktokConnection = null;
    isConnected = false;
  }
}

module.exports = { init, connect, disconnect, isConnected: () => isConnected , getCurrentSecUid };