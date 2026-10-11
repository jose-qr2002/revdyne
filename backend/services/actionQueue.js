// backend/services/actionQueue.js (antes keyboardQueue.js)
const logger = require('./logger');
let robot = null;
try {
  robot = require('@jitsi/robotjs');
} catch (e) {
  console.warn('⚠️ RobotJS no disponible. Solo simulación.');
  logger.warn('teclas', 'RobotJS no disponible: las teclas solo se simulan', { error: e.message });
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
      const mods = task.modifiers || [];
      if (robot) {
        try {
          if (mods.length) robot.keyTap(task.key, mods);
          else robot.keyTap(task.key);
        } catch (err) {
          console.error(`⚠️ Error en RobotJS al presionar '${task.key}':`, err.message);
          logger.error('teclas', 'Error de RobotJS al presionar una tecla', { tecla: task.key, modificadores: mods.join('+'), error: err.message });
        }
      }
      console.log(`🎹 ${robot ? 'Presionado' : '[SIMULADO]'}: ${[...mods, task.key].join('+')}`);
    }
    // 'sound' no necesita hacer nada más aquí: ya se emitió arriba.
    // Cuando agreguemos comandos, aquí entra:
    // else if (task.type === 'minecraft_command') { ... }

    await sleep(task.delay);
  }

  isProcessing = false;
}

// Encola pulsaciones ya expandidas: [{ key, modifiers, delay }] (una por pulsación, con sus repeticiones desplegadas).
// `sound`: si se indica, suena en CADA pulsación (el paso de sonido con "en cada tecla").
function enqueueKeyPresses(presses, { sound = null, volume = 1 } = {}) {
  if (!presses?.length) return;
  for (const p of presses) {
    queue.push({ type: 'keyboard', key: p.key, modifiers: p.modifiers || [], delay: Math.max(Number(p.delay) || 0, MIN_DELAY_MS), sound, volume });
  }
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
  enqueueKeyPresses,
  enqueueSound,
  emitSoundBatch,
  isRobotAvailable: () => !!robot,
  setSocketIo: (io) => { ioInstance = io; },
};
