const express = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function() {
  const router = express.Router();

  // 🎵 NUEVO: Buscador a prueba de balas
  const possiblePaths = [
    path.join(__dirname, '../sounds'), // Desarrollo clásico
    path.join(process.cwd(), 'sounds'), // Raíz del proyecto
    path.join(__dirname, 'sounds'), // Mismo nivel
    path.join(process.resourcesPath || '', 'app', 'dist-backend', 'sounds'), // EXACTAMENTE lo que muestran tus fotos
    path.join(__dirname, '../../dist-backend/sounds') // Por si acaso las relativas cambian
  ];

  // Encuentra la primera ruta de la lista que realmente exista en tu PC
  let soundsPath = possiblePaths.find(p => fs.existsSync(p));

  // Si no encuentra ninguna (muy raro), creamos la de por defecto para evitar crasheos
  if (!soundsPath) {
    soundsPath = path.join(__dirname, '../sounds');
    fs.mkdirSync(soundsPath, { recursive: true });
  }

  console.log(`🎵 Sonidos cargados con éxito desde: ${soundsPath}`);

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

  // 3. Ruta para que React reproduzca el archivo directamente
  router.use('/play', express.static(soundsPath));

  return router;
};