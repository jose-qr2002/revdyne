const express = require('express');
const store = require('../data/store');
const entitlements = require('../services/entitlements');

module.exports = function profilesRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => res.json(store.loadProfiles()));

  router.post('/', (req, res) => {
    const check = entitlements.validateProfilesSave(store.loadProfiles(), req.body);
    if (!check.ok) return res.status(403).json({ code: 'LIMIT_REACHED', error: check.error });
    // El perfil Global siempre existe (se procesa siempre) y el perfil activo tiene que estar en la lista
    const previous = store.loadProfiles();
    if (previous.list?.prof_global && !req.body.list.prof_global) return res.status(400).json({ error: 'El perfil Global no se puede eliminar.' });
    if (req.body.activeProfileId && !req.body.list[req.body.activeProfileId]) return res.status(400).json({ error: 'El perfil activo no existe.' });
    store.saveProfiles(req.body);
    res.json({ ok: true });
  });

  return router;
};