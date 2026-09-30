const express = require('express');
const store = require('../data/store');
const entitlements = require('../services/entitlements');

module.exports = function profilesRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => res.json(store.loadProfiles()));

  router.post('/', (req, res) => {
    const check = entitlements.validateProfilesSave(store.loadProfiles(), req.body);
    if (!check.ok) return res.status(403).json({ code: 'LIMIT_REACHED', error: check.error });
    store.saveProfiles(req.body);
    res.json({ ok: true });
  });

  return router;
};