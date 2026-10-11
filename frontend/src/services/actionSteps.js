// Pasos de una acción: { name, enabled, steps: [{ type, wait?, ...campos }] }. Una acción puede combinar tecla, sonido, video, win...
// Formato en backend/services/actionSteps.js; las acciones antiguas ya llegan convertidas (backend/data/migrations.js).

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

export function getSteps(action) {
  return Array.isArray(action?.steps) ? action.steps.filter(s => s && typeof s.type === 'string') : [];
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
