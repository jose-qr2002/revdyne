// backend/routes/videoOverlays.js
// Pantallas (/api/overlays/video, montada antes de /api/overlays) y bibliotecas de videos (/api/videos) e imágenes/GIF (/api/images).
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const paths = require('../paths');
const videoService = require('../services/videoService');
const { OVERLAY_PUBLIC_BASE_URL } = require('../data/defaults');

const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // un GIF largo puede pesar bastante

// Nombre seguro y único dentro de la carpeta: letras, números, punto, guion y guion bajo; si ya existe, se añade _2, _3...
function uniqueName(dir, original, fallbackBase) {
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, path.extname(original)).replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || fallbackBase;
  let name = `${base}${ext}`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base}_${i}${ext}`;
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
      image: { min: videoService.IMAGE_MIN_SECONDS, max: videoService.IMAGE_MAX_SECONDS, default: videoService.IMAGE_DEFAULT_SECONDS },
    });
  });

  router.param('n', (req, res, next, n) => {
    if (!videoService.SCREENS.includes(parseInt(n, 10))) return res.status(404).json({ error: 'Pantalla desconocida' });
    next();
  });

  router.post('/:n', (req, res) => res.json({ screens: videoService.updateScreen(parseInt(req.params.n, 10), req.body || {}).screens }));

  // Probar: { kind: 'video' | 'image', file, volume? (video), duration? (imagen, segundos) }
  router.post('/:n/test', (req, res) => {
    const isImage = req.body?.kind === 'image';
    const result = isImage
      ? videoService.playImage(req.params.n, { file: req.body?.file, duration: req.body?.duration })
      : videoService.play(req.params.n, { file: req.body?.file, volume: req.body?.volume ?? 100 });
    res.status(result.executed ? 200 : 400).json({
      ok: result.executed, label: result.label,
      error: result.executed ? undefined : (isImage ? 'La imagen no existe en la biblioteca.' : 'El video no existe en la biblioteca.'),
    });
  });
  router.post('/:n/stop', (req, res) => { videoService.stop(req.params.n); res.json({ ok: true }); });

  return router;
}

// Biblioteca de archivos de una carpeta: GET /list, POST /upload (campo `field`), DELETE /:name
function makeLibrary({ dir, extensions, field, maxBytes, maxMessage, formatMessage, fallbackBase, list, remove }) {
  const router = express.Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      filename: (req, file, cb) => cb(null, uniqueName(dir, file.originalname, fallbackBase)),
    }),
    limits: { fileSize: maxBytes },
    fileFilter: (req, file, cb) => cb(null, extensions.includes(path.extname(file.originalname).toLowerCase())),
  });

  router.get('/list', (req, res) => res.json(list()));

  router.post('/upload', (req, res) => {
    upload.single(field)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? maxMessage : err.message });
      if (!req.file) return res.status(400).json({ error: formatMessage });
      res.json({ success: true, filename: req.file.filename, size: req.file.size });
    });
  });

  router.delete('/:name', (req, res) => {
    try { res.json({ ok: remove(req.params.name) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

const libraryRoutes = () => makeLibrary({
  dir: paths.VIDEOS_DIR, extensions: videoService.VIDEO_EXTENSIONS, field: 'video', maxBytes: MAX_VIDEO_BYTES, fallbackBase: 'video',
  maxMessage: 'El video pesa más de 300 MB.', formatMessage: 'Formato no admitido. Usa MP4 o WEBM.',
  list: videoService.listVideos, remove: videoService.deleteVideo,
});

const imageLibraryRoutes = () => makeLibrary({
  dir: paths.IMAGES_DIR, extensions: videoService.IMAGE_EXTENSIONS, field: 'image', maxBytes: MAX_IMAGE_BYTES, fallbackBase: 'imagen',
  maxMessage: 'La imagen pesa más de 50 MB.', formatMessage: 'Formato no admitido. Usa PNG, JPG, GIF o WEBP.',
  list: videoService.listImages, remove: videoService.deleteImage,
});

module.exports = { screensRoutes, libraryRoutes, imageLibraryRoutes };
