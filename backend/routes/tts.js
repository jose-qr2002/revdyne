// backend/routes/tts.js
const express = require('express');
const store = require('../data/store');
const piperService = require('../services/piperService');
const ttsEngineManager = require('../services/ttsEngineManager');
const edgeTtsService = require('../services/edgeTtsService');
const chatFilter = require('../services/chatFilter');

module.exports = function ttsRoutes(settings) {
  const router = express.Router();

  router.get('/', (req, res) => res.json(settings.tts || {}));

  router.post('/', (req, res) => {
    const current = store.loadSettings();
    current.tts = { ...(current.tts || {}), ...req.body };
    store.saveSettings(current);
    settings.tts = current.tts;
    res.json({ ok: true });
  });

  router.get('/elevenlabs/voices', async (req, res) => {
    const key = (req.query.key || settings.tts?.elevenLabsKey || '').trim();
    if (!key) return res.status(400).json({ error: 'Sin API key' });
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
      const body = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: body?.detail?.message || JSON.stringify(body) });
      res.json(body.voices || []);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/synthesize', async (req, res) => {
    const { text } = req.body;
    const tts = settings.tts || {};
    if (!tts.elevenLabsKey || !tts.elevenLabsVoiceId) return res.status(400).json({ error: 'Configura API key y voz' });
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${tts.elevenLabsVoiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': tts.elevenLabsKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
      });
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      const arrayBuf = await r.arrayBuffer();
      res.set('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(arrayBuf));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tiktok', async (req, res) => {
    const { text, voice } = req.body;
    const voiceCode = voice || 'es_mx_002';
    if (!text) return res.status(400).json({ error: 'Falta texto' });
    try {
      const r = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceCode })
      });
      const data = await r.json();
      if (data.data) res.json({ success: true, audio: data.data });
      else res.status(500).json({ error: 'Error en TikTok TTS', details: data.error });
    } catch (e) {
      console.error('🔥 Error generando voz TikTok:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/piper/voices', (req, res) => {
    res.json(ttsEngineManager.listVoices('piper'));
  });

  router.post('/piper', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Falta texto' });

    const voiceModel = settings.tts?.piperVoice;
    if (!voiceModel) return res.status(400).json({ error: 'No hay una voz de Piper configurada' });

    try {
      const wavBuffer = await piperService.synthesizeWithPiper(text, voiceModel);
      res.set('Content-Type', 'audio/wav');
      res.send(wavBuffer);
    } catch (e) {
      console.error('🔥 Error generando voz con Piper:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/edge/voices', async (req, res) => {
    try {
      res.json(await edgeTtsService.listVoices());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/edge', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Falta texto' });

    const voiceName = settings.tts?.edgeVoice;
    if (!voiceName) return res.status(400).json({ error: 'No hay una voz de Edge TTS configurada' });

    try {
      const audioBuffer = await edgeTtsService.synthesizeWithEdge(text, voiceName);
      res.set('Content-Type', 'audio/mpeg');
      res.send(audioBuffer);
    } catch (e) {
      console.error('🔥 Error generando voz con Edge TTS:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/filter-test', (req, res) => {
    const { text, terms } = req.body;
    const list = Array.isArray(terms) ? terms : (settings.tts?.blockedTerms || []);
    const hit = chatFilter.findBlockedTerm(text || '', list);
    res.json({ blocked: !!hit, term: hit });
  });

  return router;
};