const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const { loadConfig, saveConfig } = require('./config/settings');
const { isRobotAvailable } = require('./services/keyboardQueue');
const keyboardQueue = require('./services/keyboardQueue');
const tiktokService = require('./services/tiktokService');
const stickersManager = require('./services/stickersManager');
const apiRoutes = require('./routes/api');
const ttsRoutes = require('./routes/tts');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

keyboardQueue.setSocketIo(io);
const config = loadConfig();

// 1. MIDDLEWARES GLOBALES
app.use(express.json({ limit: '10mb' }));

// 🌟 1. EL BUSCADOR INTELIGENTE DE RUTAS
const getSoundsDir = () => {
  const possiblePaths = [
    path.join(process.cwd(), 'sounds'), // 1️⃣ Ruta en Desarrollo
    path.join(process.resourcesPath || '', 'app', 'dist-backend', 'sounds'), // 2️⃣ Ruta en Producción
    path.join(__dirname, 'sounds') // 3️⃣ Fallback de emergencia
  ];

  // Buscamos cuál de estas rutas existe realmente en la PC
  let activePath = possiblePaths.find(p => fs.existsSync(p));

  // Si ninguna existe (primera vez arrancando), la creamos en la ruta de desarrollo por defecto
  if (!activePath) {
    activePath = possiblePaths[0];
    fs.mkdirSync(activePath, { recursive: true });
  }

  return activePath;
};

const SOUNDS_DIR = getSoundsDir();
console.log(`[BACKEND] 🎵 Carpeta de sonidos activa en: ${SOUNDS_DIR}`);

// 🎵 2. CONFIGURACIÓN DE SUBIDA DE SONIDOS
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, SOUNDS_DIR); // Usamos la ruta detectada
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, safeName);
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 10 * 1024 * 1024 } 
});

// 🚀 3. RUTA PARA RECIBIR EL ARCHIVO
app.post('/api/sounds/upload', upload.single('sound'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
  res.json({ success: true, filename: req.file.filename });
});

// 🌟 4. RUTA PARA LISTAR SONIDOS
app.get('/api/sounds/list', (req, res) => {
  if (!fs.existsSync(SOUNDS_DIR)) return res.json([]);
  
  fs.readdir(SOUNDS_DIR, (err, files) => {
    if (err) {
      console.error("[BACKEND] Error leyendo carpeta:", err);
      return res.json([]);
    }
    const audioFiles = files.filter(f => /\.(mp3|wav|ogg|m4a|aac)$/i.test(f));
    res.json(audioFiles);
  });
});

// Sincronización y Sistema
app.post('/api/catalog/sync', async (req, res) => {
  try {
    const response = await fetch('https://webcast.tiktok.com/webcast/gift/list/?aid=1988', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      }
    });
    if (!response.ok) throw new Error('Error de conexión con TikTok');
    const json = await response.json();
    const gifts = json.data?.gifts || [];
    if (gifts.length === 0) throw new Error('TikTok no devolvió regalos');

    const currentConfig = loadConfig();
    const catalogData = currentConfig.catalog || {};
    let nuevos = 0, actualizados = 0;

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

    currentConfig.catalog = catalogData;
    saveConfig(currentConfig);
    res.json({ success: true, nuevos, actualizados, total: Object.keys(catalogData).length, catalog: catalogData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stickers/config', (req, res) => {
  res.json({
    catalog: stickersManager.db.catalog || {},
    assignments: stickersManager.db.assignments || {}
  });
});

// 💾 Guardar asignación de un sticker a una macro
app.post('/api/stickers/assign', (req, res) => {
  const { emoteId, actionId, enabled } = req.body;
  
  if (!stickersManager.db.assignments) stickersManager.db.assignments = {};
  
  // Guardamos en RAM
  stickersManager.db.assignments[emoteId] = {
    actionId,
    enabled: enabled !== undefined ? enabled : true
  };
  
  // Guardamos en Disco
  stickersManager.save();
  
  res.json({ success: true, assignments: stickersManager.db.assignments });
});

// 🗑️ Eliminar un sticker del catálogo
app.delete('/api/stickers/:emoteId', (req, res) => {
  const { emoteId } = req.params;
  
  // Asumiendo que importaste stickersManager arriba en tu server.js
  const stickersManager = require('./services/stickersManager');
  
  if (stickersManager.db.catalog[emoteId]) {
    // 1. Lo borramos del catálogo
    delete stickersManager.db.catalog[emoteId];
    // 2. Borramos sus asignaciones (para que no queden datos fantasma)
    if (stickersManager.db.assignments[emoteId]) {
      delete stickersManager.db.assignments[emoteId];
    }
    // 3. Guardamos los cambios
    stickersManager.save();
    
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, message: 'Sticker no encontrado' });
  }
});

app.post('/api/system/restart', (req, res) => {
  res.json({ success: true });
  setTimeout(() => {
    try {
      const { app: electronApp } = require('electron');
      electronApp.relaunch();
      electronApp.exit(0);
    } catch (e) {
      process.exit(0);
    }
  }, 500);
});

// Rutas externas (Inyectadas)
app.use('/api/alerts', require('./routes/alerts')());
app.use('/api/tts', ttsRoutes(config));
app.use('/api', apiRoutes(config, io, tiktokService));

// ==========================================
// 4. CARPETAS ESTÁTICAS Y REACT (Al final)
// ==========================================
app.use('/sounds', express.static(path.join(process.cwd(), 'sounds')));
app.use(express.static(path.join(__dirname, 'frontend/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

// ==========================================
// 5. EVENTOS GLOBALES Y ARRANQUE
// ==========================================
io.on('connection', socket => {
  socket.emit('status', {
    connected: tiktokService.isConnected(),
    message: tiktokService.isConnected() ? `✅ Conectado` : 'Desconectado',
    username: config.username
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

tiktokService.init(io, config);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  🎁 TikTok Gift Keys Bot Activo          ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Abre: http://localhost:${PORT}             ║`);
  console.log(`║  RobotJS: ${isRobotAvailable() ? '✅ Activo' : '❌ No disponible'}                 ║`);
  console.log('╚══════════════════════════════════════════╝\n');
});