// backend/routes/videoOverlays.js
// Pantallas de video (/api/overlays/video, montada antes de /api/overlays) y biblioteca de videos (/api/videos).
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const paths = require('../paths');
const videoService = require('../services/videoService');
const { OVERLAY_PUBLIC_BASE_URL } = require('../data/defaults');

const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

// Nombre seguro y único dentro de la carpeta de videos: letras, números, punto, guion y guion bajo; si ya existe, se añade _2, _3...
function uniqueName(original) {
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, path.extname(original)).replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'video';
  let name = `${base}${ext}`;
  for (let i = 2; fs.existsSync(path.join(paths.VIDEOS_DIR, name)); i++) name = `${base}_${i}${ext}`;
  return name;
}

function screensRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      screens: videoService.getConfig().screens,
      counts: videoService.counts(),
      options: videoService.options,
      publicBaseUrl: OVERLAY_PUBLIC_BASE_URL,
    });
  });

  router.param('n', (req, res, next, n) => {
    if (!videoService.SCREENS.includes(parseInt(n, 10))) return res.status(404).json({ error: 'Pantalla desconocida' });
    next();
  });

  router.post('/:n', (req, res) => res.json({ screens: videoService.updateScreen(parseInt(req.params.n, 10), req.body || {}).screens }));
  router.post('/:n/test', (req, res) => {
    const result = videoService.play(req.params.n, { file: req.body?.file, volume: req.body?.volume ?? 100 });
    res.status(result.executed ? 200 : 400).json({ ok: result.executed, label: result.label, error: result.executed ? undefined : 'El video no existe en la biblioteca.' });
  });
  router.post('/:n/stop', (req, res) => { videoService.stop(req.params.n); res.json({ ok: true }); });

  return router;
}

function libraryRoutes() {
  const router = express.Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, paths.VIDEOS_DIR),
      filename: (req, file, cb) => cb(null, uniqueName(file.originalname)),
    }),
    limits: { fileSize: MAX_VIDEO_BYTES },
    fileFilter: (req, file, cb) => cb(null, videoService.VIDEO_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase())),
  });

  router.get('/list', (req, res) => res.json(videoService.listVideos()));

  router.post('/upload', (req, res) => {
    upload.single('video')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El video pesa más de 300 MB.' : err.message });
      if (!req.file) return res.status(400).json({ error: 'Formato no admitido. Usa MP4 o WEBM.' });
      res.json({ success: true, filename: req.file.filename, size: req.file.size });
    });
  });

  router.delete('/:name', (req, res) => {
    try { res.json({ ok: videoService.deleteVideo(req.params.name) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = { screensRoutes, libraryRoutes };
