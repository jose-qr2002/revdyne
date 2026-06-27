let robot = null;
try {
  robot = require('@jitsi/robotjs');
} catch (e) {
  console.warn('⚠️ RobotJS no disponible. Solo simulación.');
}

const queue = [];
let isProcessing = false;
let ioInstance = null;

// Función auxiliar para pausas asíncronas
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  while (queue.length > 0) {
    const task = queue.shift();
    
    // Solo emitimos el sonido si la tarea lo trae (ahora solo será en la 1ra tecla de la macro)
    if (task.sound && ioInstance) {
      console.log(`🔊 Emitiendo sonido '${task.sound}' para la tecla: ${task.key}`);
      ioInstance.emit('play-macro-sound', task.sound);
    }

    if (robot) {
      try {
        if (task.modifier && task.modifier !== 'none') {
          robot.keyTap(task.key, task.modifier);
        } else {
          robot.keyTap(task.key);
        }
      } catch (err) {
        console.error(`⚠️ Error en RobotJS al presionar '${task.key}':`, err.message);
      }
    }
    
    console.log(`🎹 ${robot ? 'Presionado' : '[SIMULADO]'}: ${task.modifier !== 'none' ? task.modifier + '+' : ''}${task.key}`);
    
    // ⏳ AQUÍ SUCEDE LA MAGIA: Espera los milisegundos exactos antes de la siguiente tecla
    await sleep(task.delay);
  }

  isProcessing = false;
}

function pressKeyTimes(key, modifier, times, delay = 80, sound = null) {
  if (!key || times <= 0) return;
  const safeDelay = Math.max(delay, 30); // Mínimo 30ms para no crashear el juego

  for (let i = 0; i < times; i++) {
    // Solo enviamos el sonido en la primera repetición
    const stepSound = (i === 0) ? sound : null;
    queue.push({ key, modifier, delay: safeDelay, sound: stepSound }); 
  }

  processQueue();
}

// 🌟 NUEVO: Añadimos soundEveryKey como 4º parámetro (por defecto false)
function executeMacro(macroStr, delay = 80, sound = null, soundEveryKey = false) {
  if (!macroStr) return;
  
  const sequence = [];
  const safeDelay = Math.max(delay, 30);

  if (!macroStr.includes('{')) {
    const chars = macroStr.split('');
    chars.forEach(char => {
      sequence.push({ modifier: 'none', key: char.toLowerCase() });
    });
  } else {
    const regex = /\{([^}]+)\}/g;
    let match;
    while ((match = regex.exec(macroStr)) !== null) {
      let inner = match[1].toLowerCase();
      if (inner.includes('+')) {
        const parts = inner.split('+');
        sequence.push({ modifier: parts[0], key: parts[1] });
      } else {
        sequence.push({ modifier: 'none', key: inner });
      }
    }
  }

  sequence.forEach((step, index) => {
    // 🌟 LA MAGIA AQUÍ: Si soundEveryKey es true, todas suenan. Si es false, solo la primera (index === 0).
    const stepSound = (soundEveryKey || index === 0) ? sound : null;
    queue.push({ key: step.key, modifier: step.modifier, delay: safeDelay, sound: stepSound });
  });

  processQueue(); 
}

function pressKey(key, modifier, sound = null) {
    pressKeyTimes(key, modifier, 1, 0, sound);
    return true;
}

module.exports = {
  pressKey,
  pressKeyTimes,
  executeMacro,
  isRobotAvailable: () => !!robot,
  setSocketIo: (io) => { ioInstance = io; } 
};