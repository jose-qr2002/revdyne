const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Importar módulos
const { loadConfig } = require('./config/settings');
const { isRobotAvailable } = require('./services/keyboardQueue');
const keyboardQueue = require('./services/keyboardQueue');
const tiktokService = require('./services/tiktokService');
const apiRoutes = require('./routes/api');
const ttsRoutes = require('./routes/tts');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 👇 NUEVO: Le pasamos el megáfono de sockets a la cola de teclado
keyboardQueue.setSocketIo(io);

// Configuración global
const config = loadConfig();

app.use(express.json());

// ❌ LÍNEA ELIMINADA: Ya no servimos la carpeta public antigua
// app.use(express.static(path.join(__dirname, 'public')));

// Inyectar dependencias en las rutas
app.use('/api/alerts', require('./routes/alerts')());
app.use('/api/tts', ttsRoutes(config));
app.use('/api', apiRoutes(config, io, tiktokService));

// ✅ NUEVO: Servir EXCLUSIVAMENTE la aplicación React (Frontend compilado)
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// Cualquier otra ruta que no sea de API, se la mandamos a React
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

// Configurar Sockets
io.on('connection', socket => {
  console.log('🌐 Cliente UI conectado');
  socket.emit('status', {
    connected: tiktokService.isConnected(),
    message: tiktokService.isConnected() ? `✅ Conectado` : 'Desconectado',
    username: config.username
  });
});

// ATRApar ERRORES GLOBALES Y ENVIARLOS AL FRONTEND
process.on('uncaughtException', (err) => {
  console.error('🔥 Error Crítico:', err);
  // ✅ CORRECCIÓN: Cambiado ioInstance por io
  if (io) {
    io.emit('systemError', { 
      type: 'Uncaught Exception', 
      message: err.message, 
      stack: err.stack 
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Promesa Rechazada:', reason);
  // ✅ CORRECCIÓN: Cambiado ioInstance por io
  if (io) {
    io.emit('systemError', { 
      type: 'Unhandled Rejection', 
      message: String(reason) 
    });
  }
});

// Arrancar conexión a TikTok y servidor
tiktokService.init(io, config);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  🎁 TikTok Gift Keys Bot Activo          ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Abre: http://localhost:${PORT}             ║`);
  console.log(`║  RobotJS: ${isRobotAvailable() ? '✅ Activo' : '❌ No disponible'}                 ║`);
  console.log('╚══════════════════════════════════════════╝\n');

  if (config.username) {
    tiktokService.connect(config.username);
  }
});