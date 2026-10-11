// backend/routes/api.js
const express = require('express');
const store = require('../data/store');
const actionQueue = require('../services/actionQueue');
const secUidResolver = require('../services/secUidResolver');
const { version: appVersion } = require('../../package.json');

module.exports = function apiRoutes(settings, io, tiktokService) {
  const router = express.Router();

  router.get('/config', (req, res) => {
    res.json({
      ...store.loadSettings(),
      catalog: store.loadCatalog(),
      profiles: store.loadProfiles(),
      robotAvailable: actionQueue.isRobotAvailable(),
    });
  });

  router.post('/config', (req, res) => {
    const current = store.loadSettings();
    const updated = { ...current, ...req.body };
    store.saveSettings(updated);
    Object.assign(settings, updated); // mantiene sincronizado el objeto compartido en memoria
    res.json({
      ...store.loadSettings(),
      catalog: store.loadCatalog(),
      profiles: store.loadProfiles(),
      robotAvailable: actionQueue.isRobotAvailable(),
      appVersion,
    });
  });

  router.get('/profile-preview', async (req, res) => {
    res.json(await secUidResolver.getProfilePreview(req.query.username));
  });

  router.post('/connect', (req, res) => {
    const current = store.loadSettings();
    if (req.body.username) current.username = req.body.username;
    store.saveSettings(current);
    Object.assign(settings, current);
    tiktokService.connect(settings.username);
    res.json({ ok: true });
  });

  router.post('/disconnect', (req, res) => {
    tiktokService.disconnect();
    io.emit('status', { connected: false, message: 'Desconectado manualmente' });
    res.json({ ok: true });
  });

  router.post('/test-key', (req, res) => {
    // Una sola pulsación de prueba: { key: 'w', modifiers: ['shift'], sound? } (nombres de tecla de RobotJS)
    const { key, modifiers, sound } = req.body;
    if (typeof key !== 'string' || !key.trim()) return res.status(400).json({ error: 'Falta la tecla' });
    actionQueue.enqueueKeyPresses([{ key: key.trim().toLowerCase(), modifiers: Array.isArray(modifiers) ? modifiers : [], delay: settings.keyDelayMs || 80 }], { sound: sound || null });
    res.json({ ok: true, robotAvailable: actionQueue.isRobotAvailable() });
  });

  router.get('/status', (req, res) => {
    res.json({ connected: tiktokService.isConnected(), username: settings.username, robotAvailable: actionQueue.isRobotAvailable() });
  });

  return router;
};