const ttsQueue = [];
let isSpeaking = false;
let currentConfig = {};

// 🛑 NUEVA VARIABLE: Guarda la función para matar el audio actual
let cancelCurrentAudio = null;

// Actualiza la configuración global del reproductor
export function updateTTSConfig(cfg) {
  currentConfig = cfg;
}

export function enqueueTTS(text) {
  if (!currentConfig.enabled) return;
  
  const maxQ = currentConfig.maxQueue || 10;
  if (ttsQueue.length >= maxQ) ttsQueue.shift(); 
  
  ttsQueue.push(text);
  if (!isSpeaking) processQueue();
}

async function processQueue() {
  if (ttsQueue.length === 0) {
    isSpeaking = false;
    cancelCurrentAudio = null;
    return;
  }
  
  isSpeaking = true;
  const text = ttsQueue.shift();

  try {
    // 🚦 NUEVO: El semáforo de 3 vías
    if (currentConfig.engine === 'elevenlabs') {
      await speakElevenLabs(text);
    } else if (currentConfig.engine === 'tiktok') {
      await speakTikTok(text);
    } else {
      await speakBrowser(text);
    }
  } catch (e) {
    console.error('TTS Playback Error:', e);
  }

  cancelCurrentAudio = null;
  // Pequeña pausa antes del siguiente comentario
  setTimeout(processQueue, 300);
}

function speakBrowser(text) {
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    const voiceName = currentConfig.browserVoiceName;
    
    if (voiceName) {
      const voice = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
      if (voice) utter.voice = voice;
    }

    // 🛑 FUNCIÓN PARA ABORTAR WINDOWS TTS
    cancelCurrentAudio = () => {
      window.speechSynthesis.cancel();
      resolve(); 
    };

    utter.onend = resolve;
    utter.onerror = resolve;
    window.speechSynthesis.speak(utter);
  });
}

async function speakElevenLabs(text) {
  try {
    const res = await fetch('/api/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!res.ok) throw new Error('Error sintetizando audio');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    return new Promise((resolve) => {
      const audio = new Audio(url);
      if (currentConfig.audioDeviceId && audio.setSinkId) {
        audio.setSinkId(currentConfig.audioDeviceId).catch(console.warn);
      }

      // 🛑 FUNCIÓN PARA ABORTAR ELEVENLABS
      cancelCurrentAudio = () => {
        audio.pause();
        audio.currentTime = 0;
        URL.revokeObjectURL(url);
        resolve();
      };

      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(resolve);
    });
  } catch (err) {
    console.error(err);
  }
}

// 🎤 NUEVO: Reproductor de voces virales de TikTok
async function speakTikTok(text) {
  try {
    const res = await fetch('/api/tts/tiktok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        text: text, 
        voice: currentConfig.tiktokVoice || 'es_mx_002' 
      })
    });

    if (!res.ok) throw new Error('Error al conectar con API TikTok TTS');
    const data = await res.json();
    if (!data.success || !data.audio) throw new Error(data.error || 'No audio');

    return new Promise((resolve) => {
      const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
      if (currentConfig.audioDeviceId && audio.setSinkId) {
        audio.setSinkId(currentConfig.audioDeviceId).catch(console.warn);
      }

      // 🛑 FUNCIÓN PARA ABORTAR TIKTOK
      cancelCurrentAudio = () => {
        audio.pause();
        audio.currentTime = 0;
        resolve();
      };

      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
  } catch (err) {
    console.error("TikTok TTS Error:", err);
  }
}

// 🎧 ESCUCHADORES DE EVENTOS DESDE ELECTRON
window.addEventListener('tts-action-skip-current', () => {
  if (cancelCurrentAudio) cancelCurrentAudio(); // Mata el actual, la cola sigue
});

window.addEventListener('tts-action-skip-all', () => {
  ttsQueue.length = 0; // Vacía la cola
  if (cancelCurrentAudio) cancelCurrentAudio(); // Mata el actual
});