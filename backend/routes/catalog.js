// backend/routes/catalog.js
const express = require('express');
const store = require('../data/store');
const catalogService = require('../services/catalogService');

module.exports = function catalogRoutes() {
  const router = express.Router();

  router.post('/sync', async (req, res) => {
    try {
      res.json({ success: true, ...(await catalogService.syncAllGifts()) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/', (req, res) => res.json(store.loadCatalog()));

  return router;
};
