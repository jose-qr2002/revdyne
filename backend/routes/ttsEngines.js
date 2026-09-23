const express = require('express');
const ttsEngineManager = require('../services/ttsEngineManager');

module.exports = function ttsEnginesRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => res.json(ttsEngineManager.listEnginesWithStatus()));

  router.post('/:engineId/install', async (req, res) => {
    try {
      await ttsEngineManager.installEngine(req.params.engineId);
      res.json({ success: true });
    } catch (e) {
      console.error(`🔥 Error instalando "${req.params.engineId}":`, e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/:engineId', (req, res) => {
    ttsEngineManager.uninstallEngine(req.params.engineId);
    res.json({ success: true });
  });

  router.get('/:engineId/voices', (req, res) => {
    res.json(ttsEngineManager.listVoices(req.params.engineId));
  });

  router.post('/:engineId/voices', async (req, res) => {
    const { onnxUrl } = req.body;
    if (!onnxUrl) return res.status(400).json({ error: 'Falta la URL del modelo (.onnx)' });
    try {
      const voiceId = await ttsEngineManager.installVoice(req.params.engineId, onnxUrl);
      res.json({ success: true, voiceId });
    } catch (e) {
      console.error(`🔥 Error instalando voz:`, e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:engineId/voices/catalog', (req, res) => {
    res.json(ttsEngineManager.listCatalogVoices(req.params.engineId));
  });

  router.delete('/:engineId/voices/:voiceId', (req, res) => {
    const removed = ttsEngineManager.uninstallVoice(req.params.engineId, req.params.voiceId);
    res.json({ success: true, removed });
  });

  return router;
};