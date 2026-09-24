const { TikTokLiveConnection } = require('tiktok-live-connector');
const stickersManager = require('./stickersManager');
const catalogService = require('./catalogService');
const eventEngine = require('./eventEngine');
const actionDispatcher = require('./actionDispatcher');

// ==========================================
// 1. ESTADO GLOBAL DEL SERVICIO
// ==========================================
let tiktokConnection = null;
let isConnected = false;
let ioInstance = null;
let settingsRef = null; // antes "configRef" — ahora solo trae username/keyDelayMs/tts

const streakTracker = {};
const followedUsers = new Set();
const sharedUsers = new Set();
const likeAccumulators = {};

function init(io, settings) {
  ioInstance = io;
  settingsRef = settings;
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
  if (sharedUsers.has(username)) return;
  sharedUsers.add(username);

  console.log(`📢 ${username} ha compartido el directo`);
  const result = executeEventActions('share', 'any', 1);

  ioInstance.emit('giftReceived', {
    giftId: 'action_share', giftName: '📢 Compartió el Directo', coins: 0, sender: username, newCount: 1,
    key: result.keyExecuted || 'Ninguna', pressed: result.actionExecuted, timestamp: Date.now()
  });
}

function handleFollow(data) {
  const username = getUsername(data);
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

    data.emotes.forEach(emoteWrapper => {
      const emote = emoteWrapper.emote;
      if (!emote) return;

      const emoteId = emote.id || emote.emoteId;
      const emoteName = emote.name || emote.emoteId || 'Sticker';
      const iconUrl =
        emote.image?.urlList?.[0] ||
        emote.image?.imageList?.[0]?.url ||
        emote.imageUrl || '';

      if (emoteId && emoteId !== '?' && !catalog[emoteId]) {
        stickersManager.upsertCatalogEntry(emoteId, { name: emoteName, icon: iconUrl });
        catalogUpdated = true;
        console.log(`✅ [CATÁLOGO] Sticker nuevo detectado: ${emoteName}`);
      }

      // Ya no hay hack "action:"/"sound:" — el sticker es un trigger más
      const matches = eventEngine.findMatchingEvents('sticker', emoteId);
      matches.forEach(({ evt, actions }) => {
        const action = actions[evt.actionId];
        const result = actionDispatcher.dispatch(action, {
          times: 1,
          io: ioInstance,
          defaultDelayMs: settingsRef?.keyDelayMs || 80,
        });
        if (result.executed) {
          console.log(`🎯 [STICKER] Ejecutando "${action.name}" por sticker ${emoteName}`);
        }
      });
    });

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
  const speakableName = getSpeakableName(data); // 🌟 nuevo: para lo que se lee en voz alta

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

  const maxChars = tts.maxChars || 150;
  if (commentText.length > maxChars) commentText = commentText.slice(0, maxChars) + '...';

  const clearedName = speakableName.replace(/[_.-]/g, ' ').trim();
  const clearedComment = commentText.replace(/[_.-]/g, ' ').trim();
  const textToSay = tts.sayUsername ? `${clearedName} dice: ${clearedComment}` : clearedComment;

  ioInstance.emit('ttsComment', {
    username, comment: commentText, text: textToSay,
    isFanClub, fanLevel, isDonator, donatorLevel, isMod, badges,
    timestamp: Date.now()
  });
}

// ==========================================
// 4. GESTIÓN DE CONEXIÓN (sin cambios)
// ==========================================
function connect(username) {
  if (tiktokConnection) disconnect();

  if (!username) {
    ioInstance.emit('status', { connected: false, message: 'Sin usuario configurado' });
    return;
  }

  console.log(`\n🔄 Conectando a @${username}...`);
  ioInstance.emit('status', { connected: false, message: `Conectando a @${username}...` });

  tiktokConnection = new TikTokLiveConnection(username, { processInitialData: false });

  tiktokConnection.connect().then(state => {
    isConnected = true;
    console.log(`✅ Conectado a @${username} | Room ID: ${state.roomId}`);
    ioInstance.emit('status', { connected: true, message: `✅ Conectado a @${username}`, roomId: state.roomId, username });
  }).catch(err => {
    console.error('❌ Error de conexión:', err.message);
    ioInstance.emit('status', { connected: false, message: `❌ Error: ${err.message}` });
  });

  tiktokConnection.on('gift', handleGift);
  tiktokConnection.on('share', handleShare);
  tiktokConnection.on('follow', handleFollow);
  tiktokConnection.on('like', handleLike);
  tiktokConnection.on('chat', handleChat);

  tiktokConnection.on('disconnected', () => {
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

module.exports = { init, connect, disconnect, isConnected: () => isConnected };