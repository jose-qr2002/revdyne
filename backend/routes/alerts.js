const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os'); // 🌟 NUEVO: Necesario para leer la ruta del usuario

module.exports = function() {
  const router = express.Router();

  // 🎵 1. ÚNICA RUTA: Apuntamos directamente a Documentos
  const soundsPath = path.join(os.homedir(), 'Documents', 'REVDYNE', 'sounds');

  // Si no existe, la creamos (por seguridad)
  if (!fs.existsSync(soundsPath)) {
    fs.mkdirSync(soundsPath, { recursive: true });
  }

  console.log(`🎵 [ALERTAS] Conectado a la carpeta global: ${soundsPath}`);

  // 2. Ruta para que React pueda leer la lista de mp3 disponibles
  router.get('/list', (req, res) => {
    try {
      const files = fs.readdirSync(soundsPath);
      const audioFiles = files.filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg'));
      res.json(audioFiles);
    } catch (error) {
      console.error("Error leyendo la carpeta de sonidos:", error);
      res.status(500).json({ error: 'No se pudo leer la carpeta de sonidos' });
    }
  });

  // 3. Ruta de compatibilidad (por si alguna parte de tu front aún usa /api/alerts/play)
  router.use('/play', express.static(soundsPath));

  return router;
};