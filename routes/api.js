const express = require('express');
const { saveConfig } = require('../config/settings');
const { pressKey, isRobotAvailable } = require('../services/keyboardQueue');

module.exports = function(config, io, tiktokService) {
  const router = express.Router();
  const { executeMacro, isRobotAvailable } = require('../services/keyboardQueue');

  router.get('/config', (req, res) => res.json({ ...config, robotAvailable: isRobotAvailable() }));

  router.post('/config', (req, res) => {
    Object.assign(config, req.body);
    saveConfig(config);
    res.json({ ok: true });
  });

  router.post('/connect', (req, res) => {
    if (req.body.username) config.username = req.body.username;
    saveConfig(config);
    tiktokService.connect(config.username);
    res.json({ ok: true });
  });

  router.post('/disconnect', (req, res) => {
    tiktokService.disconnect();
    io.emit('status', { connected: false, message: 'Desconectado manualmente' });
    res.json({ ok: true });
  });

  router.put('/gift/:giftId', (req, res) => {
    const { giftId } = req.params;
    if (!config.giftMappings[giftId]) config.giftMappings[giftId] = {};
    Object.assign(config.giftMappings[giftId], req.body);
    saveConfig(config);
    res.json({ ok: true });
  });

  router.delete('/gift/:giftId', (req, res) => {
    delete config.giftMappings[req.params.giftId];
    saveConfig(config);
    res.json({ ok: true });
  });

  router.post('/test-key', (req, res) => {
    const { key } = req.body;
    // Usamos la macro para probar
    executeMacro(key, config.keyDelayMs || 80);
    res.json({ ok: true, robotAvailable: isRobotAvailable() });
  });

  router.get('/status', (req, res) => {
    res.json({ connected: tiktokService.isConnected(), username: config.username, robotAvailable: isRobotAvailable() });
  });

  return router;
};