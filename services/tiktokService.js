const { TikTokLiveConnection } = require('tiktok-live-connector');
const { saveConfig } = require('../config/settings');

// ==========================================
// 1. ESTADO GLOBAL DEL SERVICIO
// ==========================================
let tiktokConnection = null;
let isConnected = false;
let ioInstance = null;
let configRef = null;

// Memorias temporales para evitar spam
const streakTracker = {};
const followedUsers = new Set();
const sharedUsers = new Set();
const likeAccumulators = {};

function init(io, config) {
  ioInstance = io;
  configRef = config;
}

// ==========================================
// 2. MOTOR CENTRAL DE EVENTOS (NUEVO)
// ==========================================
// Esta función busca en tus reglas si hay alguna acción que deba ejecutarse
function executeEventActions(triggerType, conditionValue, times = 1) {
  if (!configRef?.events || !configRef?.actions) return { actionExecuted: false, keyExecuted: null };

  // Filtrar las reglas activas que coincidan con el disparador (ej: 'gift' y ID '5655')
  const matchingEvents = configRef.events.filter(evt => 
    evt.enabled && 
    evt.trigger === triggerType && 
    (evt.condition === 'any' || evt.condition === String(conditionValue))
  );

  let actionExecuted = false;
  let keyExecuted = null;

  matchingEvents.forEach(evt => {
    const action = configRef.actions[evt.actionId];
    
    if (action && action.enabled && action.type === 'keyboard' && action.key) {
      const { executeMacro } = require('./keyboardQueue');
      
      for (let i = 0; i < times; i++) {
        executeMacro(action.key, configRef.keyDelayMs || 80, action.sound);
      }
      
      actionExecuted = true;
      keyExecuted = action.key;
    }
  });

  return { actionExecuted, keyExecuted };
}

// Función auxiliar para extraer el nombre de usuario de forma segura
const getUsername = (data) => (data.user?.displayId) || data.uniqueId || (data.user?.nickname) || 'alguien';

// ==========================================
// 3. CONTROLADORES DE EVENTOS DE TIKTOK
// ==========================================

function handleGift(data) {
  const giftObj = data.gift || {};
  const giftId = String(data.giftId);
  const giftName = giftObj.name || `Gift #${giftId}`;
  const coins = giftObj.diamondCount || 0;
  const sender = getUsername(data);
  
  // Capturar icono
  const giftIcon = giftObj.icon?.urlList?.[0] || giftObj.image?.urlList?.[0] || data.pictureUrl || '';

  // Auto-guardar en el Catálogo si es un regalo nuevo
  if (configRef.catalog && !configRef.catalog[giftId]) {
    configRef.catalog[giftId] = { name: giftName, coins, icon: giftIcon };
    saveConfig(configRef);
  }

  // Filtro Anti-Spam de Combos (Rachas)
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

  if (coins < (configRef.minCoins || 0)) return;

  // 🚀 Disparar Motor Central
  const result = executeEventActions('gift', giftId, newCount);

  // Notificar al Frontend
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
  
  // Extraer solo los eventos de like activos
  const likeEvents = (configRef.events || []).filter(e => e.enabled && e.trigger === 'like');

  likeEvents.forEach(evt => {
    const threshold = parseInt(evt.condition);
    if (!threshold || threshold <= 0) return;

    if (likeAccumulators[evt.id] === undefined) likeAccumulators[evt.id] = 0;
    likeAccumulators[evt.id] += count;

    if (likeAccumulators[evt.id] >= threshold) {
      const timesToTrigger = Math.floor(likeAccumulators[evt.id] / threshold);
      likeAccumulators[evt.id] = likeAccumulators[evt.id] % threshold; // Guardar sobrante

      const result = executeEventActions('like', threshold, timesToTrigger);

      ioInstance.emit('giftReceived', {
        giftId: `like_${threshold}`, giftName: `❤️ Meta de ${threshold} Likes`, coins: 0, sender: username, newCount: timesToTrigger,
        key: result.keyExecuted || 'Ninguna', pressed: result.actionExecuted, timestamp: Date.now()
      });
    }
  });
}

function handleChat(data) {
  const tts = configRef.tts;
  if (!tts || !tts.enabled) return;
  
  const identity = data.userIdentity || {};
  const isFollower = identity.isFollowerOfAnchor;
  const isFanClub = identity.isSubscriberOfAnchor || identity.isGiftGiverOfAnchor;
  const isMod = identity.isModeratorOfAnchor;
  const isAnchor = identity.isAnchor;
  const username = getUsername(data);

  // 1. Filtrar por permisos
  const filterMode = tts.filterMode || 'all';
  if (filterMode === 'followers' && !isFollower && !isFanClub && !isMod && !isAnchor) return;
  if (filterMode === 'fans' && !isFanClub && !isMod && !isAnchor) return;

  let commentText = (data.comment || data.content || '').trim();
  if (!commentText) return;

  // 🛡️ 2. FILTRO DE PREFIJO EXCLUSIVO (NUEVO)
  if (tts.usePrefix && tts.prefixText) {
    const lowerComment = commentText.toLowerCase();
    const prefix = tts.prefixText.trim();

    // Si el comentario no arranca con el prefijo, lo destruimos e ignoramos el spam de "xd"
    if (!lowerComment.startsWith(prefix)) return;

    // Limpiamos el prefijo del texto final para que el bot no lea "!bot" a cada rato
    commentText = commentText.slice(prefix.length).trim();
    if (!commentText) return; // Si solo pusieron el prefijo vacío, abortamos
  }

  // 3. Filtro Anti-Idiomas Raros
  if (tts.onlyLatin) {
    // Busca cualquier carácter que NO sea Latino, Número, Puntuación, Espacio o Símbolo.
    // Emojis, letras españolas, acentos y portugués pasan el filtro perfectamente.
    const containsWeirdChars = /[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\p{M}]/u.test(commentText);
    
    if (containsWeirdChars) {
      console.log(`🚫 Comentario ignorado por filtro de idioma: ${commentText}`);
      return; 
    }
  }

  const maxChars = tts.maxChars || 150;
  if (commentText.length > maxChars) commentText = commentText.slice(0, maxChars) + '...';

  const textToSay = tts.sayUsername ? `${username} dice: ${commentText}` : commentText;

  ioInstance.emit('ttsComment', { 
    username, comment: commentText, text: textToSay, isFanClub, isMod, timestamp: Date.now()
  });
}

// ==========================================
// 4. GESTIÓN DE CONEXIÓN
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

  // Vincular eventos a sus controladores
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