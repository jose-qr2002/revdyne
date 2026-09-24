const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');
const os = require('os');

const FALLBACK_VOICES_PATH = path.join(__dirname, '../data/edgeVoicesFallback.json');
const TIMEOUT_MS = 15000;
let cachedVoices = null;

async function runSynthesis(text, voiceName) {
  const tts = new EdgeTTS({ voice: voiceName });
  const tempPath = path.join(os.tmpdir(), `edge_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

  await tts.ttsPromise(text, tempPath);

  const buffer = fs.readFileSync(tempPath);
  fs.unlink(tempPath, () => {}); // limpieza, no bloqueante

  if (!buffer || buffer.length === 0) {
    throw new Error('Edge TTS generó un archivo vacío');
  }
  return buffer;
}

async function synthesizeWithEdge(text, voiceName) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Edge TTS no respondió a tiempo (timeout de 15s)')), TIMEOUT_MS)
  );
  return Promise.race([runSynthesis(text, voiceName), timeout]);
}

function listVoices() {
  if (cachedVoices) return cachedVoices;
  const fallback = JSON.parse(fs.readFileSync(FALLBACK_VOICES_PATH, 'utf8'));
  cachedVoices = fallback.voices;
  return cachedVoices;
}

module.exports = { synthesizeWithEdge, listVoices };