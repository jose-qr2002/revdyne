// Pasos de una acción: { name, enabled, steps: [{ type, wait?, ...campos }] }. Una acción puede combinar tecla, sonido, video, win...
// MISMA conversión de acciones antiguas (un solo `type` con sus campos en la raíz) que backend/services/actionSteps.js:
// si cambia allí, cambiarla aquí.

export const STEP_TYPES = {
  keyboard: { label: 'Tecla / macro', icon: 'keyboard' },
  sound: { label: 'Sonido', icon: 'music' },
  video: { label: 'Video en pantalla', icon: 'film' },
  win: { label: 'Win Game', icon: 'trophy' },
  l4d2_command: { label: 'Comando L4D2', icon: 'gamepad', soon: true },
  minecraft_command: { label: 'Comando Minecraft', icon: 'gamepad', soon: true },
};

// Tipos siempre disponibles en cualquier juego (además de los que permite el juego del perfil)
export const ALWAYS_AVAILABLE = ['sound', 'video', 'win'];

export const MAX_WAIT_MS = 60000;

function legacySteps(action) {
  switch (action.type) {
    case 'keyboard':
      return [{ type: 'keyboard', key: action.key, delay: action.delay, sound: action.sound || null, volume: action.volume ?? 100, soundEveryKey: !!action.soundEveryKey }];
    case 'sound':
      return [{ type: 'sound', sound: action.sound, volume: action.volume ?? 100 }];
    case 'video':
      return [{ type: 'video', video: action.video, screen: action.screen, volume: action.volume ?? 100 }];
    case 'win':
      return [{ type: 'win', mode: action.mode, amount: action.amount }];
    default: {
      // eslint-disable-next-line no-unused-vars
      const { name, enabled, ...rest } = action;
      return action.type ? [rest] : [];
    }
  }
}

export function getSteps(action) {
  if (!action) return [];
  return Array.isArray(action.steps) ? action.steps.filter(s => s && typeof s.type === 'string') : legacySteps(action);
}

export const isSoundOnly = (action) => { const steps = getSteps(action); return steps.length > 0 && steps.every(s => s.type === 'sound'); };

// Resumen corto para listas y selects: "Tecla + Sonido + Video"
export function stepsSummary(action) {
  const steps = getSteps(action);
  if (!steps.length) return 'sin pasos';
  return steps.map(s => STEP_TYPES[s.type]?.label.split(' ')[0] || s.type).join(' + ');
}

// Paso nuevo con sus valores por defecto
export function newStep(type) {
  switch (type) {
    case 'keyboard': return { type, key: '', delay: 80, sound: null, volume: 100, soundEveryKey: false, wait: 0 };
    case 'sound': return { type, sound: '', volume: 100, wait: 0 };
    case 'video': return { type, video: '', screen: 1, volume: 100, wait: 0 };
    case 'win': return { type, mode: 'increase', amount: 1, wait: 0 };
    default: return { type, wait: 0 };
  }
}
