// backend/routes/catalog.js
const express = require('express');
const store = require('../data/store');
const catalogService = require('../services/catalogService');
const giftSyncLog = require('../services/giftSyncLog');

module.exports = function catalogRoutes() {
  const router = express.Router();

  router.post('/sync', async (req, res) => {
    try {
      res.json({ success: true, ...(await catalogService.syncAllGifts()) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Tratar un ID como regalo distinto (o volver a agruparlo): { id, split: boolean }
  router.post('/split', (req, res) => {
    const catalog = catalogService.setSplit(req.body?.id, !!req.body?.split);
    if (!catalog) return res.status(404).json({ error: 'Ese regalo no está en el catálogo' });
    res.json({ success: true, catalog });
  });

  // Historial (temporal) de obtenciones de regalos, la más reciente primero
  router.get('/history', (req, res) => res.json({ runs: giftSyncLog.list() }));

  router.get('/', (req, res) => res.json(store.loadCatalog()));

  return router;
};
