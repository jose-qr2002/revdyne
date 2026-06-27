let ttsQueue = [];
let isSpeaking = false;
let currentConfig = {};
let globalPlaybackRate = 1.0;

// Referencias para controlar el audio en vivo
let cancelCurrentAudio = null;
let currentHTMLAudio = null; // Para cambiar la velocidad en tiempo real

export function setPlaybackRate(rate) {
  globalPlaybackRate = rate;
  if (currentHTMLAudio) currentHTMLAudio.playbackRate = rate;
}

// 1. Actualiza la configuración y ajusta la velocidad en vivo
export function updateTTSConfig(cfg) {
  currentConfig = cfg;
  if (cfg.speed) {
    globalPlaybackRate = cfg.speed;
    if (currentHTMLAudio) currentHTMLAudio.playbackRate = cfg.speed;
  }
}

// 🚀 2. FUNCIÓN DE PRE-CARGA: Pide el audio al servidor ANTES de que le toque hablar
function preFetchAudio(text) {
  const engine = currentConfig.engine || 'browser';

  if (engine === 'elevenlabs') {
    return fetch('/api/tts/synthesize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
      .then(res => { if (!res.ok) throw new Error(); return res.blob(); })
      .then(blob => ({ type: 'audio', url: URL.createObjectURL(blob), isBlob: true }));
  }

  if (engine === 'tiktok') {
    return fetch('/api/tts/tiktok', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: currentConfig.tiktokVoice || 'es_mx_002' })
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.audio) throw new Error();
        return { type: 'audio', url: `data:audio/mp3;base64,${data.audio}`, isBlob: false };
      });
  }

  // Si es voz del sistema (browser), se resuelve instantáneamente
  return Promise.resolve({ type: 'browser', text });
}

// 3. ENCOLAR: Guarda el texto y la promesa de descarga al mismo tiempo
export function enqueueTTS(text) {
  if (!currentConfig.enabled) return;
  
  const maxQ = currentConfig.maxQueue || 10;
  if (ttsQueue.length >= maxQ) ttsQueue.shift(); 
  
  // ¡Iniciamos la descarga en segundo plano inmediatamente!
  const item = { text, audioPromise: preFetchAudio(text) };
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
      await playBrowser(audioData.text);
    } else {
      await playAudioFile(audioData.url, audioData.isBlob);
    }
  } catch (e) {
    console.error('🔥 Error reproduciendo TTS:', e);
  }

  cancelCurrentAudio = null;
  currentHTMLAudio = null;
  setTimeout(processQueue, 300); // Pausa entre comentarios
}

// 🎤 5. REPRODUCTOR: VOCES DEL SISTEMA
function playBrowser(text) {
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    const voiceName = currentConfig.browserVoiceName;
    
    if (voiceName) {
      const voice = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
      if (voice) utter.voice = voice;
    }

    utter.rate = globalPlaybackRate; // Aplicar velocidad

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
function playAudioFile(url, isBlob) {
  return new Promise(resolve => {
    const audio = new Audio(url);
    currentHTMLAudio = audio; // Lo guardamos para poder cambiarle la velocidad en vivo

    if (currentConfig.audioDeviceId && audio.setSinkId) {
      audio.setSinkId(currentConfig.audioDeviceId).catch(console.warn);
    }

    audio.playbackRate = globalPlaybackRate; // Aplicar velocidad

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