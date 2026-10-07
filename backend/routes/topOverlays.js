// backend/routes/topOverlays.js
// Overlays "mejor regalo" y "mejor combo". Se monta en /api/overlays/top (antes que /api/overlays).
const express = require('express');
const topService = require('../services/topService');
const { OVERLAY_PUBLIC_BASE_URL } = require('../data/defaults');

module.exports = function topOverlaysRoutes() {
  const router = express.Router();
  const { kinds } = topService;
  const byKind = (fn) => kinds.reduce((acc, kind) => ({ ...acc, [kind]: fn(kind) }), {});

  router.get('/', (req, res) => {
    res.json({
      ...byKind(kind => topService.getConfig(kind)),
      state: byKind(kind => topService.snapshot(kind)),
      clients: byKind(kind => topService.clientCount(kind)),
      defaults: byKind(kind => topService.defaultConfig(kind)),
      fonts: topService.fonts,
      publicBaseUrl: OVERLAY_PUBLIC_BASE_URL,
    });
  });

  router.param('kind', (req, res, next, kind) => {
    if (!topService.kindOf(kind)) return res.status(404).json({ error: 'Tipo de overlay desconocido' });
    next();
  });

  router.post('/:kind', (req, res) => res.json({ [req.params.kind]: topService.updateConfig(req.params.kind, req.body || {}) }));
  router.post('/:kind/test', (req, res) => { topService.test(req.params.kind); res.json({ ok: true }); });
  router.post('/:kind/reset', (req, res) => { topService.reset(req.params.kind); res.json({ ok: true }); });

  return router;
};
