// server.js
const express = require('express');
const http = require('http');
const net = require('net');
const { Server } = require('socket.io');
const path = require('path');

const paths = require('./backend/paths');
const { ensureFirstRun } = require('./backend/data/bootstrap');

// Garantiza config.json, catalog.json, stickers.json y profiles.json
// antes de que cualquier otra cosa intente leerlos.
ensureFirstRun();

const store = require('./backend/data/store');
const logger = require('./backend/services/logger');
const { isRobotAvailable } = require('./backend/services/actionQueue');
const actionQueue = require('./backend/services/actionQueue');
const tiktokService = require('./backend/services/tiktokService');

const apiRoutes = require('./backend/routes/api');
const ttsRoutes = require('./backend/routes/tts');
const alertsRoutes = require('./backend/routes/alerts');
const soundsRoutes = require('./backend/routes/sounds');
const catalogRoutes = require('./backend/routes/catalog');
const stickersRoutes = require('./backend/routes/stickers');
const systemRoutes = require('./backend/routes/system');
const gamesRoutes = require('./backend/routes/games')
const profilesRoutes = require('./backend/routes/profiles')
const ttsEnginesRoutes = require('./backend/routes/ttsEngines');
const actionsRoutes = require('./backend/routes/actions');
const licenseRoutes = require('./backend/routes/license');
const logsRoutes = require('./backend/routes/logs');
const overlaysRoutes = require('./backend/routes/overlays');
const topOverlaysRoutes = require('./backend/routes/topOverlays');
const rankingOverlaysRoutes = require('./backend/routes/rankingOverlays');
const topService = require('./backend/services/topService');
const rankingService = require('./backend/services/rankingService');
const overlayService = require('./backend/services/overlayService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// El overlay alojado en un dominio https (TikTok LIVE Studio) se conecta a esta app en 127.0.0.1.
// Chromium exige este encabezado en esa "petición a red privada" (también en el preflight).
server.prependListener('request', (req, res) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
});

actionQueue.setSocketIo(io);
overlayService.init(io);
topService.init(io);
rankingService.init(io);
process.on('exit', () => rankingService.flush()); // guarda los tops del día pendientes al cerrar
const settings = store.loadSettings();
logger.setDebug(settings.logDebug);
logger.info('app', 'Inicio de Revdyne', {
  version: require('./package.json').version, plataforma: process.platform, node: process.version,
  electron: process.versions.electron || null, registroDetallado: !!settings.logDebug, archivo: logger.file,
});

app.use(express.json({ limit: '10mb' }));

app.use('/api/tts/engines', ttsEnginesRoutes());
app.use('/api/sounds', soundsRoutes());
app.use('/api/catalog', catalogRoutes());
app.use('/api/stickers', stickersRoutes());
app.use('/api/profiles', profilesRoutes());
app.use('/api/games', gamesRoutes());
app.use('/api/system', systemRoutes());
app.use('/api/alerts', alertsRoutes());
app.use('/api/tts', ttsRoutes(settings));
app.use('/api/actions', actionsRoutes());
app.use('/api/license', licenseRoutes());
app.use('/api/logs', logsRoutes(settings));
app.use('/api/overlays/ranking', rankingOverlaysRoutes(() => tiktokService.isConnected()));
app.use('/api/overlays/top', topOverlaysRoutes()); // antes que /api/overlays, que tiene rutas genéricas /:kind
app.use('/api/overlays', overlaysRoutes());
app.use('/api', apiRoutes(settings, io, tiktokService));

app.use('/sounds', express.static(paths.SOUNDS_DIR));
// Página que OBS carga como Browser Source (HTML autónomo, sin React)
app.get('/overlays/top/:kind(gift|combo)', (req, res) => {
  res.sendFile(path.join(__dirname, 'backend/overlays/top.html'));
});
app.get('/overlays/ranking/:slug(gifters|gifters-daily|gifters-monthly|likes|likes-daily|likes-monthly|comments|comments-daily|comments-monthly|shares|shares-daily|shares-monthly)', (req, res) => {
  res.sendFile(path.join(__dirname, 'backend/overlays/ranking.html'));
});
app.get('/overlays/goal/:kind(likes|followers|shares|viewers|coins)', (req, res) => {
  res.sendFile(path.join(__dirname, 'backend/overlays/goal.html'));
});
app.use(express.static(path.join(__dirname, 'frontend/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

io.on('connection', socket => {
  socket.emit('status', {
    connected: tiktokService.isConnected(),
    message: tiktokService.isConnected() ? `✅ Conectado` : 'Desconectado',
    username: settings.username
  });
});

process.on('uncaughtException', err => {
  console.error('🔥 Error Crítico:', err);
  logger.error('proceso', 'Excepción no controlada', { error: err.message, stack: String(err.stack || '').split('\n').slice(0, 5).join(' | ') });
  if (io) io.emit('systemError', { type: 'Uncaught Exception', message: err.message, stack: err.stack });
});

process.on('unhandledRejection', reason => {
  console.error('🔥 Promesa Rechazada:', reason);
  logger.error('proceso', 'Promesa rechazada sin controlar', { motivo: String(reason?.message || reason), stack: String(reason?.stack || '').split('\n').slice(0, 5).join(' | ') });
  if (io) io.emit('systemError', { type: 'Unhandled Rejection', message: String(reason) });
});

tiktokService.init(io, settings);

// Puerto: 47321 en la app instalada, 3000 en desarrollo (o PORT). En la app instalada (Electron empaquetado), si está ocupado por otro programa se usa el siguiente libre
// (hasta +20) y main.js abre la ventana en el puerto real. En desarrollo (node puro o `npm start` sin empaquetar) NO hay alternativa
// automática: la ventana carga Vite, cuyo proxy apunta a un puerto fijo (VITE_BACKEND_PORT, por defecto 3000), y un puerto distinto
// lo dejaría hablando con otro programa. Ahí se elige a mano con PORT y VITE_BACKEND_PORT.
const packagedElectron = !!process.versions.electron && !process.defaultApp; // defaultApp = `electron .` (desarrollo)
// App instalada: 47321 (poco usado, para chocar menos con otros programas). Desarrollo: 3000. PORT manda sobre ambos.
// Mismo valor que DEFAULT_PORT en frontend/src/components/portUtils.js y en backend/overlays/*.html.
const BASE_PORT = Number(process.env.PORT) || (packagedElectron ? 47321 : 3000);
const PORT_TRIES = 20; // mismo rango que PORT_RANGE de backend/overlays/*.html
const canFallback = packagedElectron || process.env.REVDYNE_PORT_FALLBACK === '1'; // la variable permite probarlo sin empaquetar
let activePort = BASE_PORT;

// ¿Hay algo escuchando ya en ese puerto? En Windows un servidor en 0.0.0.0 puede arrancar "encima" de otro programa que escucha en
// 127.0.0.1:PUERTO, y entonces el navegador hablaría con el otro programa; por eso se prueba antes con una conexión de verdad.
const portInUse = (port) => Promise.all(['127.0.0.1', '::1'].map(host => new Promise(resolve => {
  const socket = net.connect({ port, host });
  const done = (busy) => { socket.destroy(); resolve(busy); };
  socket.setTimeout(400, () => done(false));
  socket.once('connect', () => done(true));
  socket.once('error', () => done(false));
}))).then(results => results.some(Boolean));

const listenOn = (port) => new Promise((resolve, reject) => {
  const onError = (err) => reject(err);
  server.once('error', onError);
  server.listen(port, () => { server.removeListener('error', onError); resolve(port); });
});

const ready = (async () => {
  const candidates = canFallback ? Array.from({ length: PORT_TRIES + 1 }, (_, i) => BASE_PORT + i) : [BASE_PORT];
  for (const port of candidates) {
    const busyMessage = `El puerto ${port} está ocupado por otro programa. En desarrollo elige otro: en PowerShell, $env:PORT=3100 antes de iniciar el backend (npm start / npm run dev) y $env:VITE_BACKEND_PORT=3100 antes de iniciar Vite.`;
    // Se prueba siempre (también sin alternativa): sin esto, Windows deja arrancar el servidor junto a otro programa que ya usa ese puerto
    if (await portInUse(port)) { if (canFallback) continue; throw new Error(busyMessage); }
    try { activePort = await listenOn(port); break; } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      if (!canFallback) throw new Error(busyMessage);
    }
  }
  if (!server.listening) throw new Error(`No hay un puerto libre entre ${BASE_PORT} y ${BASE_PORT + PORT_TRIES}`);

  process.env.REVDYNE_PORT = String(activePort);
  if (activePort !== BASE_PORT) logger.warn('app', `El puerto ${BASE_PORT} estaba ocupado: Revdyne usa el ${activePort}`, { puerto: activePort });
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  🎁 REVDYNE Activo                      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Abre: http://localhost:${activePort}             ║`);
  console.log(`║  RobotJS: ${isRobotAvailable() ? '✅ Activo' : '❌ No disponible'}                 ║`);
  console.log('╚══════════════════════════════════════════╝\n');

  require('./backend/services/license').startRefreshLoop();
  return activePort;
})();
ready.catch(err => {
  console.error('❌ El servidor no pudo arrancar:', err.message);
  logger.error('app', 'El servidor no pudo arrancar', { error: err.message, codigo: err.code });
  if (!canFallback) process.exit(1); // en Electron lo gestiona main.js (diálogo de error)
});

module.exports = { ready, getPort: () => activePort };