const express = require('express');
const license = require('../services/license');
const entitlements = require('../services/entitlements');
const store = require('../data/store');

module.exports = function licenseRoutes() {
  const router = express.Router();
  const snapshot = () => ({
    ...license.getStatus(),
    limits: entitlements.getLimits(),
    usage: entitlements.countUsage(store.loadProfiles())
  });

  router.get('/status', (_req, res) => res.json(snapshot()));

  router.post('/activate', async (req, res) => {
    try {
      await license.activate(req.body?.code);
      res.json({ ok: true, ...snapshot() });
    } catch (e) {
      res.status(400).json({ ok: false, code: e.code || 'ERROR', error: e.message });
    }
  });

  router.post('/deactivate', async (_req, res) => {
    await license.deactivate();
    res.json({ ok: true, ...snapshot() });
  });

  return router;
};