const express = require('express');
const { saveConfig } = require('../config/settings');

module.exports = function(config) {
  const router = express.Router();

  // 1. OBTENER CONFIGURACIÓN
  router.get('/', (req, res) => res.json(config.tts || {}));

  // 2. GUARDAR CONFIGURACIÓN
  router.post('/', (req, res) => {
    config.tts = { ...(config.tts || {}), ...req.body };
    saveConfig(config);
    res.json({ ok: true });
  });

  // 3. ELEVENLABS: OBTENER VOCES
  router.get('/elevenlabs/voices', async (req, res) => {
    const key = (req.query.key || config.tts?.elevenLabsKey || '').trim();
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

  // 4. ELEVENLABS: SINTETIZAR AUDIO
  router.post('/synthesize', async (req, res) => {
    const { text } = req.body;
    const tts = config.tts || {};
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

  // 5. NUEVO: TIKTOK VOCES VIRALES
  router.post('/tiktok', async (req, res) => {
    const { text, voice } = req.body;
    const voiceCode = voice || 'es_mx_002'; // Loquendo por defecto
    
    if (!text) return res.status(400).json({ error: 'Falta texto' });

    try {
      const r = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceCode })
      });
      
      const data = await r.json();
      
      if (data.data) {
        // TikTok devuelve Base64
        res.json({ success: true, audio: data.data });
      } else {
        res.status(500).json({ error: 'Error en TikTok TTS', details: data.error });
      }
    } catch (e) {
      console.error('🔥 Error generando voz TikTok:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};