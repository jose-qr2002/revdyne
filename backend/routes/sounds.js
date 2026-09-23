// backend/routes/sounds.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const paths = require('../paths');

module.exports = function soundsRoutes() {
  const router = express.Router();

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, paths.SOUNDS_DIR),
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      cb(null, safeName);
    }
  });
  const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

  router.post('/upload', upload.single('sound'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
    res.json({ success: true, filename: req.file.filename });
  });

  router.get('/list', (req, res) => {
    fs.readdir(paths.SOUNDS_DIR, (err, files) => {
      if (err) {
        console.error('[SOUNDS] Error leyendo carpeta:', err);
        return res.json([]);
      }
      res.json(files.filter(f => /\.(mp3|wav|ogg|m4a|aac)$/i.test(f)));
    });
  });

  return router;
};