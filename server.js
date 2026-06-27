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

// 📦 NUEVA RUTA: Sincronizar Catálogo de TikTok
app.post('/api/catalog/sync', async (req, res) => {
  try {
    const response = await fetch('https://webcast.tiktok.com/webcast/gift/list/?aid=1988', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) throw new Error('Error de conexión con TikTok');

    const json = await response.json();
    const gifts = json.data?.gifts || [];
    
    if (gifts.length === 0) throw new Error('TikTok no devolvió regalos');

    // Cargar la configuración actual (para actualizar el catalog.json)
    const { loadConfig, saveConfig } = require('./config/settings'); // Ajusta la ruta si es necesario
    const currentConfig = loadConfig();
    const catalogData = currentConfig.catalog || {};

    let nuevos = 0;
    let actualizados = 0;

    gifts.forEach(gift => {
      const giftId = String(gift.id);
      const iconUrl = gift.image?.url_list?.[0] || gift.icon?.url_list?.[0] || '';
      
      if (!catalogData[giftId]) {
        nuevos++;
        catalogData[giftId] = { name: gift.name, coins: gift.diamond_count || 0, icon: iconUrl };
      } else {
        actualizados++;
        catalogData[giftId].name = gift.name;
        catalogData[giftId].coins = gift.diamond_count || 0;
        catalogData[giftId].icon = iconUrl;
      }
    });

    // Guardar los cambios
    currentConfig.catalog = catalogData;
    saveConfig(currentConfig);

    res.json({ success: true, nuevos, actualizados, total: Object.keys(catalogData).length, catalog: catalogData });
  } catch (error) {
    console.error('❌ Error sincronizando regalos:', error.message);
    res.status(500).json({ error: error.message });
  }
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

  // DESCOMENTAR EN CASO QUERER AUTOCONEXION
  // if (config.username) {
  //   tiktokService.connect(config.username);
  // }
});