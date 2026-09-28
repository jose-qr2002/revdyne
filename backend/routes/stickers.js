// backend/routes/stickers.js
const express = require('express');
const stickersManager = require('../services/stickersManager');
const stickerCatalogService = require('../services/stickerCatalogService');
const tiktokService = require('../services/tiktokService');
const store = require('../data/store');
const secUidResolver = require('../services/secUidResolver'); // agregar arriba

module.exports = function stickersRoutes() {
  const router = express.Router();

  router.get('/config', (req, res) => {
    res.json({
      catalog: stickersManager.getCatalog(),
      assignments: stickersManager.getActiveAssignments()
    });
  });

  router.post('/assign', (req, res) => {
    const { profileId, stickerId, actionId, enabled } = req.body;
    if (!profileId || !stickerId || !actionId) {
      return res.status(400).json({ error: 'profileId, stickerId y actionId son obligatorios' });
    }
    const events = stickersManager.assign(profileId, stickerId, actionId, enabled !== false);
    res.json({ success: true, events });
  });

  router.delete('/:stickerId', (req, res) => {
    const removed = stickersManager.removeFromCatalog(req.params.stickerId);
    if (!removed) return res.status(404).json({ success: false, message: 'Sticker no encontrado' });
    res.json({ success: true });
  });

  router.delete('/:stickerId/assign/:profileId', (req, res) => {
    const { stickerId, profileId } = req.params;
    const removed = stickersManager.unassign(profileId, stickerId);
    res.json({ success: true, removed });
  });

  router.post('/sync', async (req, res) => {
    const settings = store.loadSettings();
    try {
      const secUid = await secUidResolver.getSecUid(settings.username, tiktokService.getCurrentSecUid());
      const entries = await stickerCatalogService.fetchStickerCatalog(secUid, settings.tiktokAuth);
      const { catalog, added } = stickersManager.upsertManyCatalogEntries(entries);
      res.json({ success: true, total: entries.length, added, catalog });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};