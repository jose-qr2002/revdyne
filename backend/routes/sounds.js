// backend/routes/sounds.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { spawn } = require('child_process');
const paths = require('../paths');
const logger = require('../services/logger');

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

  // Abre la carpeta de sonidos en el Explorador (para añadir audios a mano)
  router.post('/open-folder', async (req, res) => {
    const dir = paths.SOUNDS_DIR;
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* abajo fallará con un motivo claro */ }
    let shell = null;
    try { shell = require('electron').shell; } catch { /* node puro, sin Electron */ }
    if (shell?.openPath) {
      const err = await shell.openPath(dir).catch(e => e.message); // '' si salió bien
      if (!err) return res.json({ ok: true, dir });
      logger.warn('app', 'No se pudo abrir la carpeta de sonidos', { error: err, dir });
      return res.json({ ok: false, dir, error: err });
    }
    if (process.platform === 'win32') {
      const child = spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' });
      child.on('error', (e) => logger.warn('app', 'No se pudo lanzar el Explorador', { error: e.message }));
      child.unref();
      return res.json({ ok: true, dir });
    }
    res.json({ ok: false, dir, error: 'Este sistema no permite abrir carpetas desde la app' });
  });

  return router;
};