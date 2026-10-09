// backend/routes/winOverlay.js
// Overlay "Win Game". Se monta en /api/overlays/win (antes que /api/overlays, que tiene rutas genéricas /:kind).
const express = require('express');
const multer = require('multer');
const path = require('path');
const paths = require('../paths');
const winService = require('../services/winService');
const { OVERLAY_PUBLIC_BASE_URL } = require('../data/defaults');

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MEDIA_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm'];

module.exports = function winOverlayRoutes() {
  const router = express.Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, paths.MEDIA_DIR),
      // Nombre propio (el original puede traer caracteres raros): win_<fecha>_<azar>.<extensión>
      filename: (req, file, cb) => cb(null, `win_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: MAX_MEDIA_BYTES },
    fileFilter: (req, file, cb) => cb(null, MEDIA_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase())),
  });

  router.get('/', (req, res) => {
    res.json({
      config: winService.getConfig(),
      state: winService.snapshot(),
      clients: winService.clientCount(),
      options: winService.options,
      fonts: winService.fonts,
      publicBaseUrl: OVERLAY_PUBLIC_BASE_URL,
    });
  });

  // Meta y/o conteo a un valor concreto: { goal?, count? }
  router.post('/state', (req, res) => res.json(winService.setValues(req.body || {})));
  // Sumar o restar: { field: 'count' | 'goal', delta }
  router.post('/adjust', (req, res) => {
    const { field, delta } = req.body || {};
    res.json(field === 'goal' ? winService.adjustGoal(delta) : winService.adjustCount(delta));
  });
  router.post('/reset-count', (req, res) => res.json(winService.resetCount()));

  // Diseño y atajos: { activeStyle?, styles?: { <id>: {…cambios} }, keyIncrease?, keyDecrease? }
  router.post('/config', (req, res) => res.json({ config: winService.updateConfig(req.body || {}) }));
  router.post('/styles/:id/reset', (req, res) => res.json({ config: winService.resetStyle(req.params.id) }));

  // Fondo (imagen, GIF o video): devuelve la ruta que luego se guarda en el estilo (bgMedia)
  router.post('/media', (req, res) => {
    upload.single('media')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo pesa más de 25 MB.' : err.message });
      if (!req.file) return res.status(400).json({ error: 'Formato no admitido. Usa PNG, JPG, GIF, WEBP, MP4 o WEBM.' });
      res.json({ url: `/media/${req.file.filename}` });
    });
  });

  return router;
};
