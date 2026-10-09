// backend/routes/rankingOverlays.js
// Overlays "Top 10". Se monta en /api/overlays/ranking (antes que /api/overlays).
const express = require('express');
const rankingService = require('../services/rankingService');
const { OVERLAY_PUBLIC_BASE_URL } = require('../data/defaults');

module.exports = function rankingOverlaysRoutes(isConnected = () => false) {
  const router = express.Router();
  const { kinds, KINDS, METRICS } = rankingService;
  const byKind = (fn) => kinds.reduce((acc, kind) => ({ ...acc, [kind]: fn(kind) }), {});

  router.get('/', (req, res) => {
    res.json({
      boards: kinds.map(kind => ({ kind, metric: KINDS[kind].metric, period: KINDS[kind].period, slug: KINDS[kind].slug })),
      metrics: METRICS,
      configs: byKind(kind => rankingService.getConfig(kind)),
      state: byKind(kind => rankingService.snapshot(kind)),
      clients: byKind(kind => rankingService.clientCount(kind)),
      defaults: byKind(kind => rankingService.defaultConfig(kind)),
      fonts: rankingService.fonts,
      publicBaseUrl: OVERLAY_PUBLIC_BASE_URL,
    });
  });

  // Cambia el usuario cuyos tops se ven (al terminar de escribirlo en la barra lateral); solo si tiene datos guardados
  router.post('/owner', (req, res) => res.json(rankingService.previewOwner(req.body?.username, isConnected())));

  router.param('kind', (req, res, next, kind) => {
    if (!rankingService.kindOf(kind)) return res.status(404).json({ error: 'Tipo de overlay desconocido' });
    next();
  });

  router.post('/:kind', (req, res) => res.json({ config: rankingService.updateConfig(req.params.kind, req.body || {}) }));
  router.post('/:kind/test', (req, res) => { rankingService.test(req.params.kind); res.json({ ok: true }); });
  router.post('/:kind/reset', (req, res) => { rankingService.reset(req.params.kind); res.json({ ok: true }); });
  router.delete('/:kind/entries/:key', (req, res) => res.json({ ok: rankingService.removeEntry(req.params.kind, req.params.key) }));

  return router;
};
