import { TIKTOK_VOICES } from './ttsVoices';

let ttsQueue = [];
let isSpeaking = false;
let currentConfig = {};
let globalPlaybackRate = 1.0;
let globalVolume = 1.0;

export function setVolume(percent) {
  globalVolume = Math.min(1, Math.max(0, percent / 100));
  if (currentHTMLAudio) currentHTMLAudio.volume = globalVolume;
}

// Referencias para controlar el audio en vivo
let cancelCurrentAudio = null;
let currentHTMLAudio = null; // Para cambiar la velocidad en tiempo real

export function setPlaybackRate(rate) {
  globalPlaybackRate = rate;
  if (currentHTMLAudio) currentHTMLAudio.playbackRate = effectiveRate(currentHTMLAudio, rate);
}

// 1. Actualiza la configuración y ajusta la velocidad en vivo
export function updateTTSConfig(cfg) {
  currentConfig = cfg;
  if (typeof cfg.volume === 'number') setVolume(cfg.volume);
  if (cfg.speed) {
    globalPlaybackRate = cfg.speed;
    if (currentHTMLAudio) currentHTMLAudio.playbackRate = effectiveRate(currentHTMLAudio, cfg.speed);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// TONO DE LA VOZ (más agudo / más grave) sin cambiar la velocidad
//   currentConfig.pitch = semitonos (-12 ... +12, 0 = normal). Factor de frecuencia = 2^(semitonos/12).
//   - Voces del sistema: SpeechSynthesisUtterance.pitch (0 a 2) hace justo eso.
//   - Audios (TikTok, ElevenLabs, Piper, Edge): se decodifica el audio y se reescribe como WAV con la frecuencia de muestreo
//     multiplicada por el factor (sube/baja el tono y también acorta/alarga la duración). La duración se corrige al
//     reproducir con playbackRate = velocidad / factor, y como los navegadores conservan el tono al cambiar playbackRate
//     (preservesPitch), el resultado es: tono = factor y velocidad = la que pide el usuario.
// ---------------------------------------------------------------------------------------------------------------------
const pitchFactor = (semitones = currentConfig.pitch) => 2 ** ((Number(semitones) || 0) / 12);

let audioCtx = null;
const getAudioContext = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
};

// AudioBuffer -> WAV de 16 bits; `rateFactor` multiplica la frecuencia de muestreo escrita en la cabecera
function encodeWav(buffer, rateFactor) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const view = new DataView(new ArrayBuffer(44 + dataSize));
  const writeText = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  const sampleRate = Math.round(buffer.sampleRate * rateFactor);

  writeText(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true);
  writeText(36, 'data'); view.setUint32(40, dataSize, true);

  const data = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// Cambia el tono de un audio ya descargado. Si algo falla, se reproduce tal cual (sin cambio de tono).
async function applyPitch(audio, semitones) {
  const factor = pitchFactor(semitones);
  if (audio.type !== 'audio' || Math.abs(factor - 1) < 0.001) return audio;
  try {
    const bytes = await (await fetch(audio.url)).arrayBuffer();
    const decoded = await getAudioContext().decodeAudioData(bytes);
    const url = URL.createObjectURL(encodeWav(decoded, factor));
    if (audio.isBlob) URL.revokeObjectURL(audio.url);
    return { type: 'audio', url, isBlob: true, pitchFactor: factor };
  } catch (e) {
    console.warn('No se pudo cambiar el tono de la voz:', e);
    return audio;
  }
}

// Velocidad real del <audio>: se compensa el acortamiento/alargamiento que ya trae el audio por el cambio de tono
// Chromium silencia el audio fuera de 0.25x-4x, y con velocidad 0.5-2 y tono +-12 el cociente justo cabe en ese rango; se limita por si acaso
const effectiveRate = (audio, speed) => Math.min(4, Math.max(0.25, (audio._fixedSpeed ?? speed) / (audio._pitchFactor || 1)));

// ---------------------------------------------------------------------------------------------------------------------
// ALEATORIZACIÓN (velocidad, tono y voz). Cada mensaje nuevo sortea sus propios valores cuando la opción está activa;
// los mensajes que ya estaban en cola conservan los suyos.
//   - velocidad: entre RANDOM_SPEED_RANGE (x), en pasos de 0.05
//   - tono: entre RANDOM_PITCH_RANGE (semitonos), enteros
//   - voz: una de las voces del MOTOR seleccionado. Voces del sistema y Edge: solo las del mismo idioma que la voz elegida
//     (si no, leería en español con una voz china); TikTok, Piper y ElevenLabs: todas las del motor.
// ---------------------------------------------------------------------------------------------------------------------
export const RANDOM_SPEED_RANGE = [0.8, 1.6];
export const RANDOM_PITCH_RANGE = [-6, 6];

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function pickOptions() {
  return {
    speed: currentConfig.randomSpeed ? Math.round(rand(...RANDOM_SPEED_RANGE) * 20) / 20 : null,
    pitch: currentConfig.randomPitch ? Math.round(rand(...RANDOM_PITCH_RANGE)) : null,
  };
}

const langOf = (code) => String(code || '').toLowerCase().split(/[-_]/)[0];

// Las listas de voces del servidor se piden una vez y se reutilizan (si falla la petición no se guarda el fallo)
const poolCache = {};
function cachedList(key, url) {
  if (!poolCache[key]) {
    poolCache[key] = fetch(url)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(list => { if (!Array.isArray(list)) throw new Error(); return list; })
      .catch(err => { delete poolCache[key]; throw err; });
  }
  return poolCache[key];
}

// Identificadores de las voces entre las que se sortea. [] = sin lista: se usa la voz configurada.
async function voicePool(engine) {
  try {
    if (engine === 'tiktok') return TIKTOK_VOICES.map(v => v.value);
    if (engine === 'piper') return await cachedList('piper', '/api/tts/piper/voices');
    if (engine === 'elevenlabs') {
      const key = currentConfig.elevenLabsKey;
      if (!key) return [];
      return (await cachedList(`eleven:${key}`, `/api/tts/elevenlabs/voices?key=${encodeURIComponent(key)}`)).map(v => v.voice_id);
    }
    if (engine === 'edge') {
      const all = await cachedList('edge', '/api/tts/edge/voices');
      const lang = langOf(currentConfig.edgeVoice);
      const same = lang ? all.filter(v => langOf(v.name) === lang) : all;
      return (same.length ? same : all).map(v => v.name);
    }
    // Voces del sistema
    const all = window.speechSynthesis.getVoices();
    const chosen = all.find(v => v.name === currentConfig.browserVoiceName);
    const lang = langOf(chosen?.lang) || 'es';
    const same = all.filter(v => langOf(v.lang) === lang);
    return (same.length ? same : all).map(v => v.name);
  } catch {
    return [];
  }
}

async function pickVoice(engine) {
  const pool = await voicePool(engine);
  return pool.length ? pick(pool) : null;
}

// 🚀 2. FUNCIÓN DE PRE-CARGA: Pide el audio al servidor ANTES de que le toque hablar
async function preFetchAudio(text, opts) {
  const engine = currentConfig.engine || 'browser';
  const voice = currentConfig.randomVoice ? await pickVoice(engine) : null; // null = la voz configurada
  return applyPitch(await fetchAudio(text, voice, engine), opts.pitch ?? currentConfig.pitch);
}

function fetchAudio(text, voice, engine) {

  if (engine === 'elevenlabs') {
    return fetch('/api/tts/synthesize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId: voice || undefined })
    })
      .then(res => { if (!res.ok) throw new Error(); return res.blob(); })
      .then(blob => ({ type: 'audio', url: URL.createObjectURL(blob), isBlob: true }));
  }

  if (engine === 'tiktok') {
    return fetch('/api/tts/tiktok', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: voice || currentConfig.tiktokVoice || 'es_mx_002' })
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.audio) throw new Error();
        return { type: 'audio', url: `data:audio/mp3;base64,${data.audio}`, isBlob: false };
      });
  }

  if (engine === 'piper') {
    return fetch('/api/tts/piper', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: voice || undefined })
    })
      .then(res => { if (!res.ok) throw new Error(); return res.blob(); })
      .then(blob => ({ type: 'audio', url: URL.createObjectURL(blob), isBlob: true }));
  }

  if (engine === 'edge') {
    return fetch('/api/tts/edge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: voice || undefined })
    })
      .then(res => { if (!res.ok) throw new Error(); return res.blob(); })
      .then(blob => ({ type: 'audio', url: URL.createObjectURL(blob), isBlob: true }));
  }

  // Si es voz del sistema (browser), se resuelve instantáneamente
  return Promise.resolve({ type: 'browser', text, voice });
}

// 3. ENCOLAR: Guarda el texto y la promesa de descarga al mismo tiempo
export function enqueueTTS(text) {
  if (!currentConfig.enabled) return;
  
  const maxQ = currentConfig.maxQueue || 10;
  if (ttsQueue.length >= maxQ) ttsQueue.shift(); 
  
  // ¡Iniciamos la descarga en segundo plano inmediatamente!
  const opts = pickOptions(); // velocidad y tono de ESTE mensaje (null = los configurados)
  const item = { text, opts, audioPromise: preFetchAudio(text, opts) };
  ttsQueue.push(item);
  
  if (!isSpeaking) processQueue();
}

// 4. PROCESAR COLA
async function processQueue() {
  if (ttsQueue.length === 0) {
    isSpeaking = false;
    cancelCurrentAudio = null;
    currentHTMLAudio = null;
    return;
  }
  
  isSpeaking = true;
  const currentItem = ttsQueue.shift();

  try {
    // Esperamos a que la pre-carga termine (si el internet es rápido, será instantáneo)
    const audioData = await currentItem.audioPromise;

    if (audioData.type === 'browser') {
      await playBrowser(audioData.text, audioData.voice, currentItem.opts);
    } else {
      await playAudioFile(audioData.url, audioData.isBlob, audioData.pitchFactor, currentItem.opts.speed);
    }
  } catch (e) {
    console.error('🔥 Error reproduciendo TTS:', e);
  }

  cancelCurrentAudio = null;
  currentHTMLAudio = null;
  setTimeout(processQueue, 300); // Pausa entre comentarios
}

// 🎤 5. REPRODUCTOR: VOCES DEL SISTEMA
function playBrowser(text, voiceOverride, opts = {}) {
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    const voiceName = voiceOverride || currentConfig.browserVoiceName;
    
    if (voiceName) {
      const voice = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
      if (voice) utter.voice = voice;
    }

    utter.rate = opts.speed ?? globalPlaybackRate; // Aplicar velocidad
    utter.pitch = Math.min(2, Math.max(0, pitchFactor(opts.pitch ?? currentConfig.pitch))); // Aplicar tono (0 a 2; 1 = normal)
    utter.volume = globalVolume;
    
    cancelCurrentAudio = () => {
      window.speechSynthesis.cancel();
      resolve(); 
    };

    utter.onend = resolve;
    utter.onerror = resolve;
    window.speechSynthesis.speak(utter);
  });
}

// 🎧 6. REPRODUCTOR UNIFICADO: TIKTOK Y ELEVENLABS
function playAudioFile(url, isBlob, factor = 1, fixedSpeed = null) {
  return new Promise(resolve => {
    const audio = new Audio(url);
    audio._fixedSpeed = fixedSpeed; // velocidad aleatoria de este mensaje: no la cambia el control de velocidad en vivo
    audio._pitchFactor = factor; // el audio ya viene con el tono cambiado: la velocidad se compensa (ver effectiveRate)
    audio.preservesPitch = true;
    currentHTMLAudio = audio; // Lo guardamos para poder cambiarle la velocidad en vivo

    if (currentConfig.audioDeviceId && audio.setSinkId) {
      audio.setSinkId(currentConfig.audioDeviceId).catch(console.warn);
    }

    audio.playbackRate = effectiveRate(audio, globalPlaybackRate); // Aplicar velocidad
    audio.volume = globalVolume;

    cancelCurrentAudio = () => {
      audio.pause();
      audio.currentTime = 0;
      if (isBlob) URL.revokeObjectURL(url); // Limpiar RAM
      resolve();
    };

    audio.onended = () => { if (isBlob) URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { if (isBlob) URL.revokeObjectURL(url); resolve(); };
    audio.play().catch(resolve);
  });
}

// 🛑 7. ESCUCHADORES DE EVENTOS DESDE ELECTRON (Teclas Globales)
window.addEventListener('tts-action-skip-current', () => {
  if (cancelCurrentAudio) cancelCurrentAudio(); // Mata el actual, la cola sigue
});

window.addEventListener('tts-action-skip-all', () => {
  ttsQueue.length = 0; // Vacía la cola
  if (cancelCurrentAudio) cancelCurrentAudio(); // Mata el actual
});