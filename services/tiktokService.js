const { TikTokLiveConnection } = require('tiktok-live-connector');
const { saveConfig } = require('../config/settings');
const stickersManager = require('./stickersManager');
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
      
      // ⏱️ Leer el delay personalizado de la acción (o usar 80ms por defecto)
      const actionDelay = action.delay !== undefined ? action.delay : (configRef.keyDelayMs || 80);
      
      // 🌟 NUEVO: Extraer si quiere el sonido en cada tecla
      const playEveryKey = action.soundEveryKey || false;

      for (let i = 0; i < times; i++) {
        executeMacro(action.key, actionDelay, action.sound, playEveryKey); // Pasamos el 4º parámetro
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
  // 🛡️ 1. CAPTURA DE BADGES (EMBLEMAS VIP Y CLUB DE FANS)
  const badges = (data.user?.badgeList || []).map(b => {
    const iconUrl =
      b.combine?.icon?.urlList?.[0] ||
      b.image?.urlList?.[0] ||
      b.icons?.urlList?.[0] ||
      null;
      
    const label = b.combine?.str || b.label || '';
    
    // SceneType 10 = FansClub, SceneType 8 = Donador/Nivel
    const isFans = b.sceneType === 10 || (label && isNaN(Number(label)));
    const isLevel = b.sceneType === 8 || (!isNaN(Number(label)) && label !== '');
    const type = isFans ? 'fans' : isLevel ? 'level' : 'other';
    
    return { 
      label, 
      iconUrl, 
      type, 
      level: b.privilegeLogExtra?.level || null 
    };
  }).filter(b => b.label || b.iconUrl);

  // 🎁 2. EXTRACCIÓN Y REGISTRO DE STICKERS / EMOTES
  if (data.emotes && data.emotes.length > 0) {
    let catalogUpdated = false; 
    
    data.emotes.forEach(emoteWrapper => {
      const emote = emoteWrapper.emote; 
      if (!emote) return;

      const emoteId = emote.id || emote.emoteId; 
      const emoteName = emote.name || emote.emoteId || "Sticker";

      const iconUrl = 
        emote.image?.urlList?.[0] || 
        emote.image?.imageList?.[0]?.url || 
        emote.imageUrl || '';
      
      // ⚡ CONSULTAMOS LA MEMORIA RAM
      if (emoteId && emoteId !== '?' && !stickersManager.db.catalog[emoteId]) {
        stickersManager.db.catalog[emoteId] = { name: emoteName, icon: iconUrl };
        catalogUpdated = true; 
        console.log(`✅ [CATÁLOGO] Sticker NUEVO detectado y cargado en memoria: ${emoteName}`);
      }
      
      // ⚡ DISPARADOR DE MACROS O SONIDOS POR STICKER
      const assignment = stickersManager.db.assignments?.[emoteId];

      if (assignment && assignment.enabled && assignment.actionId) {
        const target = assignment.actionId;

        // ⌨️ CASO A: Es una Acción de Teclado
        if (target.startsWith('action:')) {
          const actionId = target.replace('action:', '');
          const actionGlobal = configRef.actions?.[actionId];
          
          if (actionGlobal && actionGlobal.enabled && actionGlobal.type === 'keyboard' && actionGlobal.key) {
            console.log(`🎯 [ACCIÓN] Ejecutando macro de Sticker: ${actionGlobal.name}`);
            
            const { executeMacro } = require('./keyboardQueue');
            
            const actionDelay = actionGlobal.delay !== undefined ? actionGlobal.delay : (configRef.keyDelayMs || 80);
            const playEveryKey = actionGlobal.soundEveryKey || false;
            const soundToPlay = actionGlobal.soundFile || actionGlobal.sound; 

            executeMacro(actionGlobal.key, actionDelay, soundToPlay, playEveryKey);
          }
        } 
        
        // 🎵 CASO B: Es solo un Sonido Directo
        else if (target.startsWith('sound:')) {
          const soundFile = target.replace('sound:', '');
          console.log(`🎵 [SONIDO] Reproduciendo sonido por Sticker: ${soundFile}`);
          
          if (typeof ioInstance !== 'undefined') {
            ioInstance.emit('play-macro-sound', soundFile);
          } else if (typeof io !== 'undefined') {
            io.emit('play-macro-sound', soundFile);
          }
        }
      }
    });

    // 💾 3. GUARDAR A DISCO
    if (catalogUpdated) {
      stickersManager.save(); 
      if (typeof ioInstance !== 'undefined') {
        ioInstance.emit('catalog:newSticker', stickersManager.db.catalog);
      }
    }
  }

  // 🔊 3. LÓGICA DE TEXT-TO-SPEECH (TTS) ORIGINAL MEJORADA
  const tts = configRef.tts;
  if (!tts || !tts.enabled) return;
  
  const identity = data.userIdentity || {};
  const isFollower = identity.isFollowerOfAnchor;
  const isMod = identity.isModeratorOfAnchor;
  const isAnchor = identity.isAnchor;
  const username = getUsername(data);

  // 🌟 NUEVO: Detectar Club de Fans y Donadores analizando los Badges reales
  const fanBadge = badges.find(b => b.type === 'fans');
  const donatorBadge = badges.find(b => b.type === 'level');

  const isFanClub = !!fanBadge;
  const fanLevel = fanBadge && fanBadge.level ? parseInt(fanBadge.level, 10) : 0;
  
  const isDonator = !!donatorBadge;
  const donatorLevel = donatorBadge && donatorBadge.level ? parseInt(donatorBadge.level, 10) : 0;

  // 1. Filtrar por permisos
  const filterMode = tts.filterMode || 'all';
  if (filterMode === 'followers' && !isFollower && !isFanClub && !isMod && !isAnchor) return;
  if (filterMode === 'fans' && !isFanClub && !isMod && !isAnchor) return;
  
  // 🚀 Filtro por Nivel de Fan Club (Opcional, si agregas 'minFanLevel' al config del front)
  if (filterMode === 'fans' && tts.minFanLevel && fanLevel < tts.minFanLevel && !isMod && !isAnchor) return;

  let commentText = (data.comment || data.content || '').trim();
  if (!commentText) return;

  // 🛡️ 2. FILTRO DE PREFIJO EXCLUSIVO
  if (tts.usePrefix && tts.prefixText) {
    const lowerComment = commentText.toLowerCase();
    const prefix = tts.prefixText.trim();
    if (!lowerComment.startsWith(prefix)) return;
    commentText = commentText.slice(prefix.length).trim();
    if (!commentText) return; 
  }

  // 3. Filtro Anti-Idiomas Raros
  if (tts.onlyLatin) {
    const containsWeirdChars = /[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\p{M}]/u.test(commentText);
    if (containsWeirdChars) {
      console.log(`🚫 Comentario ignorado por filtro de idioma: ${commentText}`);
      return; 
    }
  }

  const maxChars = tts.maxChars || 150;
  if (commentText.length > maxChars) commentText = commentText.slice(0, maxChars) + '...';

  const textToSay = tts.sayUsername ? `${username} dice: ${commentText}` : commentText;

  // Emitimos el evento de TTS enviando todo lo necesario al frontend
  ioInstance.emit('ttsComment', { 
    username, 
    comment: commentText, 
    text: textToSay, 
    isFanClub, 
    fanLevel,      // <- Nivel del Club de Fans
    isDonator, 
    donatorLevel,  // <- Nivel de Donador
    isMod, 
    badges,        // <- Lista completa de badges
    timestamp: Date.now()
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