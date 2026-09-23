const express = require('express');
const store = require('../data/store');

module.exports = function profilesRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => res.json(store.loadProfiles()));

  router.post('/', (req, res) => {
    store.saveProfiles(req.body); // el frontend manda el árbol completo {list, activeProfileId}
    res.json({ ok: true });
  });

  return router;
};