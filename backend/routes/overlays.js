// backend/routes/overlays.js
const express = require('express');
const overlayService = require('../services/overlayService');
const { OVERLAY_PUBLIC_BASE_URL } = require('../data/defaults');

module.exports = function overlaysRoutes() {
  const router = express.Router();
  const { kinds } = overlayService;

  const byKind = (fn) => kinds.reduce((acc, kind) => ({ ...acc, [kind]: fn(kind) }), {});

  router.get('/', (req, res) => {
    res.json({
      ...byKind(kind => overlayService.getConfig(kind)),
      state: byKind(kind => overlayService.snapshot(kind)),
      clients: byKind(kind => overlayService.clientCount(kind)),
      defaultStyles: byKind(kind => overlayService.defaultStyles(kind)),
      fonts: overlayService.fonts,
      publicBaseUrl: OVERLAY_PUBLIC_BASE_URL,
    });
  });

  // Tipo inválido -> 404 (solo likes y followers)
  router.param('kind', (req, res, next, kind) => {
    if (!overlayService.kindOf(kind)) return res.status(404).json({ error: 'Tipo de overlay desconocido' });
    next();
  });

  router.post('/:kind', (req, res) => {
    res.json({ [req.params.kind]: overlayService.updateConfig(req.params.kind, req.body || {}) });
  });

  // "Probar": suma un 10% de la meta vigente para ver la barra moverse sin directo.
  router.post('/:kind/test', (req, res) => {
    const { kind } = req.params;
    const { goal } = overlayService.snapshot(kind);
    overlayService.addManual(kind, Math.max(1, Math.round(goal * 0.1)));
    res.json({ ok: true });
  });

  router.post('/:kind/reset', (req, res) => {
    overlayService.reset(req.params.kind, true);
    res.json({ ok: true });
  });

  return router;
};
