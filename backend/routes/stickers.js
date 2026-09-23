// backend/routes/stickers.js
const express = require('express');
const stickersManager = require('../services/stickersManager');

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

  return router;
};