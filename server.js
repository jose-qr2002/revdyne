// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const paths = require('./backend/paths');
const { ensureFirstRun } = require('./backend/data/bootstrap');

// Garantiza config.json, catalog.json, stickers.json y profiles.json
// antes de que cualquier otra cosa intente leerlos.
ensureFirstRun();

const store = require('./backend/data/store');
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
const overlaysRoutes = require('./backend/routes/overlays');
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
const settings = store.loadSettings();

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
app.use('/api/overlays', overlaysRoutes());
app.use('/api', apiRoutes(settings, io, tiktokService));

app.use('/sounds', express.static(paths.SOUNDS_DIR));
// Página que OBS carga como Browser Source (HTML autónomo, sin React)
app.get('/overlays/goal/:kind(likes|followers|shares|viewers)', (req, res) => {
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
  if (io) io.emit('systemError', { type: 'Uncaught Exception', message: err.message, stack: err.stack });
});

process.on('unhandledRejection', reason => {
  console.error('🔥 Promesa Rechazada:', reason);
  if (io) io.emit('systemError', { type: 'Unhandled Rejection', message: String(reason) });
});

tiktokService.init(io, settings);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  🎁 REVDYNE Activo                      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Abre: http://localhost:${PORT}             ║`);
  console.log(`║  RobotJS: ${isRobotAvailable() ? '✅ Activo' : '❌ No disponible'}                 ║`);
  console.log('╚══════════════════════════════════════════╝\n');

  require('./backend/services/license').startRefreshLoop();
});