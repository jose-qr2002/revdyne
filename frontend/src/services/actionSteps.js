// Pasos de una acción: { name, enabled, steps: [{ type, wait?, ...campos }] }. Una acción puede combinar teclas, sonido, video, win...
// Formato en backend/services/actionSteps.js; las acciones antiguas ya llegan convertidas (backend/data/migrations.js).

export const STEP_TYPES = {
  keyboard: { label: 'Teclas', icon: 'keyboard' },
  sound: { label: 'Sonido', icon: 'music' },
  video: { label: 'Video en pantalla', icon: 'film' },
  win: { label: 'Win Game', icon: 'trophy' },
  l4d2_command: { label: 'Comando L4D2', icon: 'gamepad', soon: true },
  minecraft_command: { label: 'Comando Minecraft', icon: 'gamepad', soon: true },
};

// Tipos siempre disponibles en cualquier juego (además de los que permite el juego del perfil)
export const ALWAYS_AVAILABLE = ['sound', 'video', 'win'];

export const MAX_WAIT_MS = 60000;
export const MAX_REPEAT = 100;
export const MIN_KEY_DELAY_MS = 30; // la cola de teclas no baja de esto entre pulsaciones (actionQueue.MIN_DELAY_MS)

export function getSteps(action) {
  return Array.isArray(action?.steps) ? action.steps.filter(s => s && typeof s.type === 'string') : [];
}

export const isSoundOnly = (action) => { const steps = getSteps(action); return steps.length > 0 && steps.every(s => s.type === 'sound'); };

// Resumen corto para listas y selects: "Teclas + Sonido + Video"
export function stepsSummary(action) {
  const steps = getSteps(action);
  if (!steps.length) return 'sin pasos';
  return steps.map(s => STEP_TYPES[s.type]?.label.split(' ')[0] || s.type).join(' + ');
}

// Paso nuevo con sus valores por defecto
export function newStep(type) {
  switch (type) {
    case 'keyboard': return { type, keys: [], wait: 0 };
    case 'sound': return { type, sound: '', volume: 100, everyKey: false, wait: 0 };
    case 'video': return { type, video: '', screen: 1, volume: 100, wait: 0 };
    case 'win': return { type, mode: 'increase', amount: 1, wait: 0 };
    default: return { type, wait: 0 };
  }
}

// ---- Teclas ----
// Nombres para mostrar. Misma tabla en backend/services/actionSteps.js (KEY_LABELS)
const KEY_LABELS = {
  control: 'Ctrl', shift: 'Shift', alt: 'Alt', command: 'Win', space: 'Espacio', enter: 'Enter', escape: 'Esc', tab: 'Tab',
  backspace: 'Retroceso', delete: 'Supr', insert: 'Insert', home: 'Inicio', end: 'Fin', pageup: 'Re Pág', pagedown: 'Av Pág',
  up: 'Arriba', down: 'Abajo', left: 'Izquierda', right: 'Derecha', capslock: 'Bloq Mayús', printscreen: 'Impr Pant', menu: 'Menú',
};
export const keyLabel = (key) => KEY_LABELS[key] || (/^numpad_/.test(key) ? `Num ${key.slice(7)}` : String(key).toUpperCase());
// "Ctrl+Shift+W" (sin repeticiones)
export const comboLabel = (k) => [...(k.modifiers || []).map(keyLabel), keyLabel(k.key)].join('+');

// Pulsaciones de una pasada de todos los pasos de teclado de una acción (suma de repeticiones)
export function totalPresses(steps) {
  return steps.filter(s => s.type === 'keyboard')
    .reduce((n, s) => n + (s.keys || []).filter(k => k.key).reduce((m, k) => m + Math.min(MAX_REPEAT, Math.max(1, parseInt(k.repeat, 10) || 1)), 0), 0);
}
