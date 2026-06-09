const express = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function() {
  const router = express.Router();
  const soundsPath = path.join(__dirname, '../sounds');

  // 1. Asegurar que la carpeta existe
  if (!fs.existsSync(soundsPath)) {
      fs.mkdirSync(soundsPath);
  }

  // 2. Ruta para que React pueda leer la lista de mp3 disponibles
  router.get('/list', (req, res) => {
    try {
      const files = fs.readdirSync(soundsPath);
      // Filtramos solo archivos de audio
      const audioFiles = files.filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg'));
      res.json(audioFiles);
    } catch (error) {
      res.status(500).json({ error: 'No se pudo leer la carpeta de sonidos' });
    }
  });

  // 3. Ruta para que React reproduzca el archivo directamente
  router.use('/play', express.static(soundsPath));

  return router;
};