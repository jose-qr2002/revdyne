const { TikTokLiveConnection } = require('tiktok-live-connector');
const { pressKeyTimes } = require('./keyboardQueue');
const { saveConfig } = require('../config/settings');

let tiktokConnection = null;
let isConnected = false;
let ioInstance = null;
let configRef = null;
const streakTracker = {};
const followedUsers = new Set();
const sharedUsers = new Set();

const likeAccumulators = {}; // NUEVO: Un diccionario dinámico para infinitas huchas
// Inicializador para inyectar dependencias
function init(io, config) {
  ioInstance = io;
  configRef = config;
}

function connect(username) {
  if (tiktokConnection) {
    disconnect();
  }

  if (!username) {
    ioInstance.emit('status', { connected: false, message: 'Sin usuario configurado' });
    return;
  }

  console.log(`\n🔄 Conectando a @${username}...`);
  ioInstance.emit('status', { connected: false, message: `Conectando a @${username}...` });

  tiktokConnection = new TikTokLiveConnection(username, {
    processInitialData: false
  });

  tiktokConnection.connect().then(state => {
    isConnected = true;
    console.log(`✅ Conectado a @${username} | Room ID: ${state.roomId}`);
    ioInstance.emit('status', {
      connected: true, message: `✅ Conectado a @${username}`, roomId: state.roomId, username
    });
  }).catch(err => {
    console.error('❌ Error de conexión:', err.message);
    ioInstance.emit('status', { connected: false, message: `❌ Error: ${err.message}` });
  });

  tiktokConnection.on('gift', handleGift);
  tiktokConnection.on('chat', handleChat);

  // NUEVO: Escuchar evento de Compartir (Share)
  tiktokConnection.on('share', (data) => {
    // 👇 Extraemos el nombre con la nueva estructura de la librería
    const username = (data.user && data.user.displayId) 
                     || data.uniqueId 
                     || (data.user && data.user.nickname) 
                     || 'alguien';

    // 🛑 BLOQUEO DE SPAM: Si ya compartió en este stream, lo ignoramos para evitar abusos
    if (sharedUsers.has(username)) return; 
    sharedUsers.add(username);

    console.log(`📢 ${username} ha compartido el directo`);

    const eventId = 'action_share';
    const eventName = '📢 Compartió el Directo';

    // 1. Si no existe en config, lo creamos
    if (!configRef.giftMappings[eventId]) {
      configRef.giftMappings[eventId] = {
        name: eventName,
        coins: 0,
        key: '',
        modifier: 'none',
        enabled: true,
        icon: 'https://cdn-icons-png.flaticon.com/512/929/929564.png' // Icono de compartir
      };
      saveConfig(configRef);
      ioInstance.emit('newGift', { giftId: eventId, giftName: eventName, coins: 0, icon: configRef.giftMappings[eventId].icon });
    }

    // 2. Extraer y ejecutar la macro asignada
    const mapping = configRef.giftMappings[eventId];
    let keyToPress = mapping?.enabled ? mapping.key : null;
    let soundToPlay = mapping?.enabled ? mapping.sound : null; // 🎵 NUEVO
    let pressed = false;

    if (keyToPress) {
      const { executeMacro } = require('./keyboardQueue');
      executeMacro(keyToPress, configRef.keyDelayMs, soundToPlay); // 🎵 NUEVO
      pressed = true;
    }

    // 3. Enviarlo al Log visual
    ioInstance.emit('giftReceived', {
      giftId: eventId,
      giftName: eventName,
      coins: 0,
      sender: username,
      newCount: 1,
      key: keyToPress,
      modifier: 'none',
      pressed,
      timestamp: Date.now()
    });
  });

  tiktokConnection.on('like', (data) => {
    // 1. Extraemos la cantidad de likes (ahora es 'count')
    const count = data.count || 1;

    // 2. Extraemos el nombre con la nueva estructura
    const username = (data.user && data.user.displayId) 
                     || data.uniqueId 
                     || (data.user && data.user.nickname) 
                     || 'Comunidad';

    // Leemos la lista de metas directamente de tu config.json
    const likeEvents = configRef.likeEvents || [];

    likeEvents.forEach(event => {
      // Si la meta no tiene un límite válido, la saltamos
      if (!event.threshold || event.threshold <= 0) return;

      const eventId = `action_like_${event.id}`;
      const eventName = `❤️ Meta de ${event.threshold} Likes`;

      // Si esta hucha no existe en nuestra memoria temporal, la creamos en cero
      if (likeAccumulators[eventId] === undefined) {
        likeAccumulators[eventId] = 0;
      }

      // Le sumamos los likes a esta hucha específica
      likeAccumulators[eventId] += count;

      // Si llegó a la meta...
      if (likeAccumulators[eventId] >= event.threshold) {
        const timesToTrigger = Math.floor(likeAccumulators[eventId] / event.threshold);
        likeAccumulators[eventId] = likeAccumulators[eventId] % event.threshold; // Guardar sobrante

        // 1. Crear el regalo si no existe en la config general
        if (!configRef.giftMappings[eventId]) {
          configRef.giftMappings[eventId] = {
            name: eventName,
            coins: 0,
            key: '',
            modifier: 'none',
            enabled: true,
            icon: 'https://cdn-icons-png.flaticon.com/512/833/833472.png'
          };
          saveConfig(configRef);
          ioInstance.emit('newGift', { giftId: eventId, giftName: eventName, coins: 0, icon: configRef.giftMappings[eventId].icon });
        } else if (configRef.giftMappings[eventId].name !== eventName) {
          // Actualizar el nombre en vivo si cambiaste el número en el panel
          configRef.giftMappings[eventId].name = eventName;
          saveConfig(configRef);
        }

        // 2. Extraer y ejecutar la macro
        const mapping = configRef.giftMappings[eventId];
        let keyToPress = mapping?.enabled ? mapping.key : null;
        let soundToPlay = mapping?.enabled ? mapping.sound : null; 
        let pressed = false;

        if (keyToPress) {
          const { executeMacro } = require('./keyboardQueue');
          for (let i = 0; i < timesToTrigger; i++) {
            executeMacro(keyToPress, configRef.keyDelayMs, soundToPlay); 
          }
          pressed = true;
        }

        // 3. Mandar al log (Usando la nueva variable de usuario)
        ioInstance.emit('giftReceived', {
          giftId: eventId,
          giftName: eventName,
          coins: 0,
          sender: username, // 👈 Aquí aplicamos el nombre real
          newCount: timesToTrigger,
          key: keyToPress,
          modifier: 'none',
          pressed,
          timestamp: Date.now()
        });
      }
    });
  });

  // NUEVO: Escuchar evento de Nuevo Seguidor
  tiktokConnection.on('follow', (data) => {
    // 👇 Extraemos el nombre con la nueva estructura
    const username = (data.user && data.user.displayId) 
                     || data.uniqueId 
                     || (data.user && data.user.nickname) 
                     || 'alguien';

    // 🛑 BLOQUEO DE SPAM: Si ya nos siguió en este stream, lo ignoramos
    if (followedUsers.has(username)) {
      return; 
    }
    
    // Lo anotamos en la lista negra de la sesión actual
    followedUsers.add(username);

    console.log(`👤 Nuevo seguidor real: @${username}`);

    const eventId = 'action_follow';
    const eventName = '👤 Nuevo Seguidor';

    // 1. Si este "regalo falso" no existe en config, lo creamos
    if (!configRef.giftMappings[eventId]) {
      configRef.giftMappings[eventId] = {
        name: eventName,
        coins: 0,
        key: '',
        modifier: 'none',
        enabled: true,
        icon: 'https://cdn-icons-png.flaticon.com/512/456/456212.png' // Un icono genérico de usuario
      };
      saveConfig(configRef);
      ioInstance.emit('newGift', { giftId: eventId, giftName: eventName, coins: 0, icon: configRef.giftMappings[eventId].icon });
    }

    // 2. Extraer la macro asignada
    const mapping = configRef.giftMappings[eventId];
    let keyToPress = mapping?.enabled ? mapping.key : null;
    let soundToPlay = mapping?.enabled ? mapping.sound : null; // 🎵 NUEVO
    let pressed = false;

    // 3. Ejecutar la macro si tiene una asignada
    if (keyToPress) {
      const { executeMacro } = require('./keyboardQueue');
      executeMacro(keyToPress, configRef.keyDelayMs, soundToPlay); // 🎵 NUEVO
      pressed = true;
    }

    // 4. Enviarlo al Log en vivo del Frontend (lo disfrazamos de regalo)
    ioInstance.emit('giftReceived', {
      giftId: eventId,
      giftName: eventName,
      coins: 0,
      sender: username,
      newCount: 1,
      key: keyToPress,
      modifier: 'none',
      pressed,
      timestamp: Date.now()
    });
    
    // (Opcional) Si quieres que el bot TTS lo lea, descomenta esta línea:
    // if (configRef.tts?.enabled) {
    //   ioInstance.emit('ttsComment', { username, comment: 'ha comenzado a seguirte', text: `${username} ha comenzado a seguirte`, isFanClub: false, isMod: false, timestamp: Date.now() });
    // }
  });
  
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

function handleGift(data) {
  const giftObj = data.gift || {};
  const giftId = String(data.giftId);
  const giftName = giftObj.name || `Gift #${giftId}`;
  const coins = giftObj.diamondCount || 0;
  
  const sender = (data.user && data.user.displayId) || data.uniqueId || 'alguien';
  // NUEVO: Capturar la URL de la imagen original de TikTok
  let giftIcon = '';
  if (giftObj.icon && giftObj.icon.urlList && giftObj.icon.urlList.length > 0) {
    giftIcon = giftObj.icon.urlList[0];
  } else if (giftObj.image && giftObj.image.urlList && giftObj.image.urlList.length > 0) {
    giftIcon = giftObj.image.urlList[0];
  } else if (typeof data.pictureUrl === 'string') {
    giftIcon = data.pictureUrl;
  }

  // 3. Sistema Anti-Spam de Rachas (Combos reparado)
  let newCount = 1;
  const giftType = giftObj.type || data.giftType || 0; // 👈 Corrección clave: tipo de regalo

  if (giftType === 1) { // 1 significa que es un regalo de combo (ej. Rosas)
    const streakKey = `${sender}_${giftId}`;
    
    // Verificamos si es el mensaje final del combo (TikTok envía 1 o true)
    const isEnd = data.repeatEnd === 1 || data.repeatEnd === true;
    const currentRepeat = data.repeatCount || 1;
    const prev = streakTracker[streakKey] || 0;

    // Cuántos regalos NUEVOS llegaron en este milisegundo exacto
    newCount = currentRepeat - prev; 

    if (!isEnd) {
      streakTracker[streakKey] = currentRepeat;
    } else {
      // Es el mensaje final del combo. Borramos la memoria.
      delete streakTracker[streakKey];
    }

    // 🛑 FILTRO DE REGALO EXTRA: Si no hay regalos nuevos, abortamos aquí mismo
    if (newCount <= 0) return; 
  }

  // 4. Ignorar regalos que no cumplan el mínimo de monedas
  if (coins < (configRef.minCoins || 0)) return;

  // 5. Guardar o actualizar en config.json
  if (!configRef.giftMappings[giftId]) {
    configRef.giftMappings[giftId] = { 
      name: giftName, 
      coins: coins, 
      key: '', 
      modifier: 'none', 
      enabled: true,
      icon: giftIcon 
    };
    saveConfig(configRef);
    ioInstance.emit('newGift', { giftId, giftName, coins, icon: giftIcon });
  } else {
    configRef.giftMappings[giftId].name = giftName;
    configRef.giftMappings[giftId].coins = coins;
    if (giftIcon && !configRef.giftMappings[giftId].icon) {
      configRef.giftMappings[giftId].icon = giftIcon;
      saveConfig(configRef);
    }
  }

  // 6. Ejecutar la Macro
  const mapping = configRef.giftMappings[giftId];
  let keyToPress = configRef.useGlobalKey && configRef.globalKey ? configRef.globalKey : (mapping?.enabled ? mapping.key : null);
  let modToUse = configRef.useGlobalKey && configRef.globalKey ? 'none' : (mapping?.modifier || 'none');
  let soundToPlay = mapping?.enabled ? mapping.sound : null; 

  let pressed = false;
  if (keyToPress && newCount > 0) {
    const { executeMacro } = require('./keyboardQueue'); 

    // Ejecutar la macro tantas veces como regalos nuevos hayan llegado
    for (let i = 0; i < newCount; i++) {
      executeMacro(keyToPress, configRef.keyDelayMs, soundToPlay); 
    }
    pressed = true;
  }

  // Notificar al frontend
  ioInstance.emit('giftReceived', { 
    giftId, giftName, coins, sender, newCount, key: keyToPress, modifier: modToUse, pressed, timestamp: Date.now() 
  });
}

function handleChat(data) {
  const tts = configRef.tts;
  if (!tts || !tts.enabled) return;
  // 1. Detección exacta 
  const identity = data.userIdentity || {};
  
  // Es seguidor si el booleano es true o si el rol es '1' o '2'
  const isFollower = identity.isFollowerOfAnchor;

  // Es del club de fans si está suscrito o tiene nivel de equipo
  const isFanClub = identity.isSubscriberOfAnchor || identity.isGiftGiverOfAnchor;

  // Es moderador
  const isMod = identity.isModeratorOfAnchor;

  // Eres tú mismo (el streamer) para que el bot siempre te lea a ti
  const isAnchor = identity.isAnchor;

  // 2. Extraer el nombre de usuario
  const username = (data.user && data.user.displayId) 
                   || data.uniqueId 
                   || (data.user && data.user.nickname) 
                   || 'alguien';
  console.log("usuarios");

  // 2. Aplicar los filtros de lectura
  const filterMode = tts.filterMode || 'all';

  if (filterMode === 'followers' && !isFollower && !isFanClub && !isMod && !isAnchor) return;
  if (filterMode === 'fans' && !isFanClub && !isMod && !isAnchor) return;

  // 4. Procesar el comentario
  let commentText = data.comment || data.content || '';
  commentText = commentText.trim();

  if (!commentText) return;

  const maxChars = tts.maxChars || 150;
  if (commentText.length > maxChars) commentText = commentText.slice(0, maxChars) + '...';

  const textToSay = tts.sayUsername ? `${username} dice: ${commentText}` : commentText;

  // Lo enviamos a React
  ioInstance.emit('ttsComment', { 
    username: username, 
    comment: commentText, 
    text: textToSay, 
    isFanClub: isFanClub, 
    isMod: isMod, 
    timestamp: Date.now()
  });
}

module.exports = { init, connect, disconnect, isConnected: () => isConnected };