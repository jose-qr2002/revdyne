// backend/routes/overlays.js
const express = require('express');
const overlayService = require('../services/overlayService');
const { OVERLAY_PUBLIC_BASE_URL } = require('../data/defaults');

module.exports = function overlaysRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      likes: overlayService.getLikesConfig(),
      state: overlayService.snapshot(),
      clients: overlayService.clientCount(),
      fonts: overlayService.fonts,
      publicBaseUrl: OVERLAY_PUBLIC_BASE_URL,
      defaultStyles: overlayService.defaultStyles(),
    });
  });

  router.post('/likes', (req, res) => {
    res.json({ likes: overlayService.updateLikesConfig(req.body || {}) });
  });

  // "Testear": suma un 10% de la meta vigente para ver la barra moverse sin directo.
  router.post('/likes/test', (req, res) => {
    const { goal } = overlayService.snapshot();
    overlayService.addLikes(Math.max(1, Math.round(goal * 0.1)));
    res.json({ ok: true });
  });

  router.post('/likes/reset', (req, res) => {
    overlayService.reset(true);
    res.json({ ok: true });
  });

  return router;
};
