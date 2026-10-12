// backend/services/tiktokService.js
// Conexión con TikTok LIVE (tiktok-live-connector): conectar/desconectar, monitores de conexión muda y estadísticas, datos de la sala.
// Los eventos los procesan los módulos de backend/services/tiktok/: gifts.js (regalos), social.js (compartir, seguir, likes) y
// chat.js (comentarios, stickers y Bot TTS). Lo que comparten (Socket.IO, ajustes) está en tiktok/context.js.
const { TikTokLiveConnection } = require('tiktok-live-connector');
const catalogService = require('./catalogService');
const stickerCatalogService = require('./stickerCatalogService'); // eslint-disable-line no-unused-vars -- lo usa el bloque comentado de connect()
const stickersManager = require('./stickersManager'); // eslint-disable-line no-unused-vars -- idem
const store = require('../data/store');
const { findSecUidDeep } = require('./secUidUtils');
const secUidResolver = require('./secUidResolver');
const overlayService = require('./overlayService');
const logger = require('./logger');
const rankingService = require('./rankingService');
const topService = require('./topService');
const ctx = require('./tiktok/context');
const gifts = require('./tiktok/gifts');
const social = require('./tiktok/social');
const chat = require('./tiktok/chat');

// ==========================================
// 1. ESTADO DE LA CONEXIÓN
// ==========================================
let tiktokConnection = null;
let isConnected = false;
let ioInstance = null;

function init(io, settings) {
  ioInstance = io;
  ctx.set(io, settings); // settings: config.json en memoria (username, keyDelayMs, minCoins, tts...)
  // Seguidores del streamer: roomInfo.data.owner.follow_info.follower_count (exacto, igual que el
  // followCount de los eventos follow). followerTotalNow no usa red; fetchFollowerTotal refresca.
  overlayService.setHooks({
    followerTotalNow: () => (isConnected ? followerTotalFrom(tiktokConnection?.roomInfo) : null),
    // Espectadores actuales al conectar (roomInfo.data.user_count); después los da el evento roomUser.
    viewersNow: () => {
      const n = Number(tiktokConnection?.roomInfo?.data?.user_count);
      return isConnected && Number.isFinite(n) ? n : null;
    },
    fetchFollowerTotal: async () => {
      if (!isConnected || !tiktokConnection) return null;
      try { return followerTotalFrom(await tiktokConnection.fetchRoomInfo()); } catch { return null; }
    },
  });
}

// Datos del perfil público (https://www.tiktok.com/@usuario): seguidores e IDIOMA del streamer. Los seguidores vienen REDONDEADOS
// (35.8k -> 35800), por eso solo se usan de respaldo cuando roomInfo no trae el total exacto. OJO: la página NO publica la región del
// streamer; su campo `region` (webapp.app-context) es la de quien visita (la tuya), no la del streamer, así que no se usa. Mejor esfuerzo:
// si algo falla, esos campos quedan en null (la meta espera al primer follow y el idioma se muestra como desconocido).
async function fetchProfileInfo(username) {
  const info = { followers: null, language: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'accept-language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) return info;
    const html = await res.text();
    // Lo más fiable es el JSON de la propia página: userInfo.user (idioma) y userInfo.stats (seguidores)
    const json = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (json) {
      try {
        const detail = JSON.parse(json[1])?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
        info.language = detail?.user?.language || null;
        info.followers = Number(detail?.stats?.followerCount) || null;
      } catch { /* se usan las expresiones de abajo */ }
    }
    if (info.followers == null) { const m = html.match(/"followerCount":\s*(\d+)/); if (m) info.followers = Number(m[1]) || null; }
    return info;
  } catch { return info; } finally { clearTimeout(timer); }
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
// 2. CONEXIÓN Y MONITORES
// ==========================================
function getCurrentSecUid() {
  return findSecUidDeep(tiktokConnection?.roomInfo);
}

// Ajustables por variable de entorno solo para pruebas
const SILENCE_MS = Number(process.env.REVDYNE_SILENCE_MS) || 45000;   // sin ningún evento -> aviso de conexión muda
const WATCH_EVERY_MS = Number(process.env.REVDYNE_WATCH_MS) || 15000;
const STATS_EVERY_MS = Number(process.env.REVDYNE_STATS_MS) || 5 * 60 * 1000;

let lastEventAt = 0;
let silentSince = 0;           // 0 = hay eventos; si no, desde cuándo no llegan
let eventCounts = {};          // eventos recibidos desde la última línea de estadísticas
let watchTimer = null;
let statsTimer = null;

// Resumen mínimo de un evento para el registro (nunca volcamos el evento completo)
function describeEvent(name, d) {
  if (!d) return undefined;
  const who = d.user?.displayId || d.uniqueId || undefined;
  if (name === 'gift') return { giftId: String(d.giftId), repeatCount: d.repeatCount, repeatEnd: d.repeatEnd, groupId: String(d.groupId), usuario: who };
  return { usuario: who };
}

// Envuelve un manejador: cuenta el evento, marca que la conexión sigue viva y, si el manejador lanza una
// excepción, la registra (antes se perdía el evento en silencio).
function guard(name, fn) {
  return (...args) => {
    lastEventAt = Date.now();
    eventCounts[name] = (eventCounts[name] || 0) + 1;
    try {
      return fn(...args);
    } catch (err) {
      logger.error('eventos', `Excepción procesando un evento "${name}" (el evento se perdió)`, {
        error: err.message, evento: describeEvent(name, args[0]), stack: String(err.stack || '').split('\n').slice(0, 4).join(' | '),
      });
    }
  };
}

// Conexión "muda": está marcada como conectada pero no llega ningún evento (ni siquiera roomUser, que llega cada
// pocos segundos). Suele ser una caída de red o de TikTok que la librería no avisa.
function checkSilence(t = Date.now()) {
  if (!isConnected || !lastEventAt) return;
  const quiet = t - lastEventAt;
  if (quiet >= SILENCE_MS && !silentSince) {
    silentSince = lastEventAt;
    logger.warn('conexion', `Sin eventos de TikTok hace ${Math.round(quiet / 1000)} s (posible conexión caída)`, { usuario: currentUser });
  } else if (quiet < SILENCE_MS && silentSince) {
    logger.info('conexion', `Los eventos se reanudaron tras ${Math.round((t - silentSince) / 1000)} s de silencio`, { usuario: currentUser });
    silentSince = 0;
  }
}

function startMonitors() {
  stopMonitors();
  lastEventAt = Date.now(); silentSince = 0; eventCounts = {};
  watchTimer = setInterval(() => checkSilence(), WATCH_EVERY_MS);
  statsTimer = setInterval(() => {
    const span = STATS_EVERY_MS >= 60000 ? `${Math.round(STATS_EVERY_MS / 60000)} min` : `${Math.round(STATS_EVERY_MS / 1000)} s`;
    logger.info('estadisticas', `Eventos recibidos en los últimos ${span}`, { usuario: currentUser, ...eventCounts });
    eventCounts = {};
  }, STATS_EVERY_MS);
  for (const t of [watchTimer, statsTimer]) if (t.unref) t.unref();
}
function stopMonitors() {
  clearInterval(watchTimer); clearInterval(statsTimer);
  watchTimer = statsTimer = null;
}

// Total de seguidores exacto de roomInfo (null si TikTok no lo entrega)
const followerTotalFrom = (info) => Number(info?.data?.owner?.follow_info?.follower_count) || null;

let currentUser = null;

function connect(username) {
  if (tiktokConnection) disconnect();
  currentUser = username || null;
  
  chat.reset();   // enfriamiento global de stickers por usuario
  social.reset(); // frecuencia "una vez" y enfriamientos por usuario, roles recordados, Super Fan
  overlayService.resetAll();
  topService.setOwner(username); // no reinicia al reconectar al mismo usuario
  rankingService.setOwner(username);
  gifts.reset();
  
  if (!username) {
    ioInstance.emit('status', { connected: false, message: 'Sin usuario configurado' });
    return;
  }

  console.log(`\n🔄 Conectando a @${username}...`);
  logger.info('conexion', 'Conectando', { usuario: username });
  ioInstance.emit('status', { connected: false, message: `Conectando a @${username}...` });

  tiktokConnection = new TikTokLiveConnection(username, { processInitialData: false,  });
  const conn = tiktokConnection; // los manejadores de esta conexión ignoran eventos si ya hay otra más nueva
  let streamEnded = false;       // TikTok avisó de que el directo terminó (la desconexión posterior es normal)

  tiktokConnection.connect().then(async state => {
    isConnected = true;
    console.log(`✅ Conectado a @${username} | Room ID: ${state.roomId}`);
    logger.info('conexion', 'Conectado', { usuario: username, roomId: state.roomId });
    startMonitors();
    ioInstance.emit('status', { connected: true, message: `✅ Conectado a @${username}`, roomId: state.roomId, username });

    

    // La meta de seguidores arranca con los que ya tiene el streamer (viene en roomInfo, sin otra petición).
    overlayService.seedFollowers();
    overlayService.seedViewers();

    // Regalos de la sala: la lista general no trae los regalos propios del streamer o de su región. Se hace en segundo plano.
    catalogService.syncRoomGifts(state.roomId, { username }).then(r => {
      if (conn !== tiktokConnection) return; // ya hay otra conexión
      logger.info('catalogo', 'Regalos de la sala sincronizados', { usuario: username, nuevos: r.nuevos, total: r.total });
      if (r.nuevos > 0) ioInstance.emit('catalog:updated', r.catalog);
    }).catch(err => logger.warn('catalogo', 'No se pudieron traer los regalos de la sala', { usuario: username, error: err.message }));
    // roomInfo sin total de seguidores (p. ej. status_code 4003110): se usa el del perfil (aproximado) hasta el primer follow
    const needFollowerFallback = !followerTotalFrom(tiktokConnection.roomInfo);
    if (needFollowerFallback) logger.warn('overlay', 'roomInfo sin total de seguidores; se usa el del perfil (aproximado)', { usuario: username, status: tiktokConnection.roomInfo?.status_code });

    // Registro de la sala: la URL de regalos con su room_id y, aparte, el idioma del streamer (la región no es pública), para ir recopilándolas. Solo se imprime y se
    // recuerda la última sala (botón "Actualizar" del catálogo); no se envía a ningún sitio.
    const roomId = String(state.roomId);
    const lastRoom = { roomId, username, idioma: null, at: Date.now() };
    store.saveLastRoom(lastRoom);
    console.log(`🎁 [REGALOS] URL de regalos de @${username}:\n   ${catalogService.giftListUrl(roomId)}`);
    fetchProfileInfo(username).then(info => {
      if (conn !== tiktokConnection) return; // ya hay otra conexión
      console.log(`🌎 [REGALOS] @${username} | idioma del perfil: ${info.language || 'desconocido'} | sala ${roomId}`);
      if (info.language) {
        store.saveLastRoom({ ...lastRoom, idioma: info.language });
        catalogService.noteRoomLanguage(roomId, info.language); // el historial de regalos anota el idioma de esa sala
      }
      if (needFollowerFallback && info.followers) {
        overlayService.setFollowerApprox(info.followers);
        logger.info('overlay', 'Seguidores aproximados del perfil', { usuario: username, seguidores: info.followers });
      }
    });

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
    logger.error('conexion', 'No se pudo conectar', { usuario: username, error: err.message, tipo: err.name });
    ioInstance.emit('status', { connected: false, message: `❌ Error: ${err.message}` });
  });

  tiktokConnection.on('gift', guard('gift', gifts.handleGift));
  tiktokConnection.on('share', guard('share', social.handleShare));
  tiktokConnection.on('roomUser', guard('roomUser', d => overlayService.setViewers(d.total))); // espectadores actuales
  tiktokConnection.on('follow', guard('follow', social.handleFollow));
  tiktokConnection.on('like', guard('like', social.handleLike));
  tiktokConnection.on('chat', guard('chat', chat.handleChat));
  tiktokConnection.on('member', guard('member', social.handleJoin));           // alguien entra al directo
  tiktokConnection.on('superFan', guard('superFan', social.handleSuperFan));
  tiktokConnection.on('superFanJoin', guard('superFanJoin', social.handleSuperFan));
  tiktokConnection.on('barrage', guard('barrage', social.handleBarrage));      // aquí llega la subida de nivel de fan

  tiktokConnection.on('disconnected', (state) => {
    // Si ya no es la conexión actual, la desconexión la pidió la app (disconnect() o una reconexión): ya quedó
    // registrada allí y no debe tocar el estado de la conexión nueva.
    if (conn !== tiktokConnection) return;
    isConnected = false;
    stopMonitors();
    console.log('🔌 Desconectado de TikTok Live');
    // Una desconexión que nadie pidió es el dato clave para diagnosticar conexiones malas (salvo que el directo haya terminado)
    if (streamEnded) logger.info('conexion', 'Desconectado: el directo había terminado', { usuario: username, codigo: state?.code });
    else logger.warn('conexion', 'Desconexión inesperada de TikTok', { usuario: username, codigo: state?.code, motivo: state?.reason });
    ioInstance.emit('status', { connected: false, message: '🔌 Desconectado' });
  });

  tiktokConnection.on('streamEnd', (e) => { streamEnded = true; logger.info('conexion', 'El directo terminó', { usuario: username, accion: e?.action }); });

  tiktokConnection.on('error', err => {
    // La librería entrega { info, exception } (no un Error). Se saca el motivo real de la excepción.
    const reason = err?.exception?.message || err?.message || err?.info || String(err);
    console.error('❌ Error TikTok:', reason);
    // Si falla el propio connect() ya se registra en su .catch(); aquí solo los errores durante la sesión
    if (isConnected) logger.error('conexion', 'Error de la conexión con TikTok', { usuario: username, error: reason, contexto: err?.info, tipo: err?.exception?.constructor?.name });
    ioInstance.emit('error', { message: reason });
  });
  
  
}

function disconnect() {
  if (tiktokConnection) {
    logger.info('conexion', 'Desconectado (a petición del usuario o por reconexión)', { usuario: currentUser });
    stopMonitors();
    tiktokConnection.disconnect();
    tiktokConnection = null;
    isConnected = false;
  }
}

module.exports = { init, connect, disconnect, isConnected: () => isConnected , getCurrentSecUid, _test: { checkSilence, guard } };