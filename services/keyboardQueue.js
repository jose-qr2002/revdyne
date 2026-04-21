let robot = null;
try {
  robot = require('@jitsi/robotjs');
} catch (e) {
  console.warn('⚠️ RobotJS no disponible. Solo simulación.');
}

const queue = [];
let isProcessing = false;

// Función auxiliar para pausas asíncronas
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  while (queue.length > 0) {
    const task = queue.shift();
    
    if (robot) {
      if (task.modifier && task.modifier !== 'none') {
        robot.keyTap(task.key, task.modifier);
      } else {
        robot.keyTap(task.key);
      }
    }
    
    console.log(`🎹 ${robot ? 'Presionado' : '[SIMULADO]'}: ${task.modifier !== 'none' ? task.modifier + '+' : ''}${task.key}`);
    
    // Espera real antes de la siguiente tecla (evita saturar el juego)
    await sleep(task.delay);
  }

  isProcessing = false;
}

function pressKeyTimes(key, modifier, times, delay = 80) {
  if (!key || times <= 0) return;
  const safeDelay = Math.max(delay, 30);

  // Agregar todas las pulsaciones a la cola
  for (let i = 0; i < times; i++) {
    queue.push({ key, modifier, delay: safeDelay });
  }

  // Iniciar el procesamiento si no está corriendo
  processQueue();
}

// NUEVA FUNCIÓN: Traduce {a}{b} o {ctrl+c} en acciones para RobotJS
function executeMacro(macroStr, delay = 80) {
  if (!macroStr) return;
  
  const sequence = [];
  const safeDelay = Math.max(delay, 30);

  // Si no tiene llaves (ej: "h"), asumimos que es una sola tecla clásica
  if (!macroStr.includes('{')) {
    sequence.push({ key: macroStr.toLowerCase(), modifier: 'none' });
  } else {
    // Si tiene llaves, extraemos todo lo que hay dentro de {...}
    const regex = /\{([^}]+)\}/g;
    let match;
    while ((match = regex.exec(macroStr)) !== null) {
      let inner = match[1].toLowerCase();
      if (inner.includes('+')) {
        const parts = inner.split('+');
        sequence.push({ modifier: parts[0], key: parts[1] }); // ej: shift+w
      } else {
        sequence.push({ modifier: 'none', key: inner }); // ej: w
      }
    }
  }

  // Agregamos toda la secuencia a la cola real
  sequence.forEach(step => {
    queue.push({ key: step.key, modifier: step.modifier, delay: safeDelay });
  });

  processQueue(); // Iniciar la cola si estaba pausada
}

function pressKey(key, modifier) {
    pressKeyTimes(key, modifier, 1, 0);
    return true;
}

module.exports = {
  pressKey,
  pressKeyTimes,
  executeMacro, // <--- Añade esto
  isRobotAvailable: () => !!robot
};