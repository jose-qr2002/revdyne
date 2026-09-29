// backend/services/actionQueue.js (antes keyboardQueue.js)
let robot = null;
try {
  robot = require('@jitsi/robotjs');
} catch (e) {
  console.warn('⚠️ RobotJS no disponible. Solo simulación.');
}

const queue = [];
let isProcessing = false;
let ioInstance = null;
const MIN_DELAY_MS = 30;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  while (queue.length > 0) {
    const task = queue.shift();

    // El sonido se emite igual sin importar el tipo de tarea que lo trae
    if (task.sound && ioInstance) {
      ioInstance.emit('play-macro-sound', task.sound, task.volume ?? 1);
    }

    if (task.type === 'keyboard') {
      if (robot) {
        try {
          if (task.modifier && task.modifier !== 'none') robot.keyTap(task.key, task.modifier);
          else robot.keyTap(task.key);
        } catch (err) {
          console.error(`⚠️ Error en RobotJS al presionar '${task.key}':`, err.message);
        }
      }
      console.log(`🎹 ${robot ? 'Presionado' : '[SIMULADO]'}: ${task.modifier !== 'none' ? task.modifier + '+' : ''}${task.key}`);
    }
    // 'sound' no necesita hacer nada más aquí: ya se emitió arriba.
    // Cuando agreguemos comandos, aquí entra:
    // else if (task.type === 'minecraft_command') { ... }

    await sleep(task.delay);
  }

  isProcessing = false;
}

function parseMacro(macroStr) {
  const sequence = [];
  if (!macroStr.includes('{')) {
    macroStr.split('').forEach(char => sequence.push({ modifier: 'none', key: char.toLowerCase() }));
    return sequence;
  }
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(macroStr)) !== null) {
    const inner = match[1].toLowerCase();
    if (inner.includes('+')) {
      const [modifier, key] = inner.split('+');
      sequence.push({ modifier, key });
    } else {
      sequence.push({ modifier: 'none', key: inner });
    }
  }
  return sequence;
}

function enqueueKeyboardMacro(macroStr, delay = 80, sound = null, soundEveryKey = false, volume = 1) {
  if (!macroStr) return;
  const safeDelay = Math.max(delay, MIN_DELAY_MS);
  const sequence = parseMacro(macroStr);

  sequence.forEach((step, index) => {
    const stepSound = (soundEveryKey || index === 0) ? sound : null;
    queue.push({ type: 'keyboard', key: step.key, modifier: step.modifier, delay: safeDelay, sound: stepSound, volume });
  });

  processQueue();
}

// Nuevo: un sonido puro también pasa por la cola, respetando el mismo orden y pacing
function enqueueSound(sound, delay = 0) {
  if (!sound) return;
  queue.push({ type: 'sound', delay: Math.max(delay, 0), sound });
  processQueue();
}

function emitSoundBatch(file, { times = 1, playbackStyle = 'sequential', volume = 1 } = {}) {
  if (!file || !ioInstance) return;
  ioInstance.emit('play-macro-sound-batch', { file, times, playbackStyle, volume });
}

module.exports = {
  enqueueKeyboardMacro,
  enqueueSound,
  emitSoundBatch,
  isRobotAvailable: () => !!robot,
  setSocketIo: (io) => { ioInstance = io; },
};