// backend/services/actionSteps.js
// Una acción es una lista de PASOS que se ejecutan juntos: { name, enabled, steps: [{ type, wait?, ...campos del tipo }] }.
// Así una misma acción puede pulsar una tecla, sonar un audio y poner un video a la vez. Tipos de paso:
//   keyboard { keys: [{ key, modifiers, delay, repeat }] }   teclas en orden. key = nombre de RobotJS ('a', 'space', 'f5', 'numpad_1'...);
//                                                            modifiers = 'shift' | 'control' | 'alt' | 'command'; delay = ms de espera
//                                                            después de CADA pulsación; repeat = veces que se pulsa (1-100)
//   sound    { sound, volume, everyKey? }                    everyKey: suena en cada pulsación de las teclas de la acción (si las hay)
//   video    { video, screen 1-9, volume }
//   win      { mode: 'increase' | 'decrease', amount }
// `wait` (ms, opcional) retrasa ese paso respecto al momento en que se dispara la acción.
//
// Las acciones guardadas en formatos anteriores las convierte backend/data/migrations.js al leer profiles.json.
// Lo mismo, en el panel: frontend/src/services/actionSteps.js (y la tabla de nombres de teclas, que está en los dos).

const MAX_WAIT_MS = 60000;
const MAX_REPEAT = 100;
const MAX_PRESSES = 500; // tope de pulsaciones encoladas por disparo (p. ej. 100 rosas x una secuencia larga no debe inundar la cola)
const MODIFIERS = ['control', 'shift', 'alt', 'command'];

function getSteps(action) {
  return Array.isArray(action?.steps) ? action.steps.filter(s => s && typeof s.type === 'string') : [];
}

const stepWait = (step) => Math.min(MAX_WAIT_MS, Math.max(0, parseInt(step.wait, 10) || 0));
const hasStep = (action, type) => getSteps(action).some(s => s.type === type);
// Solo suena un audio (sin teclas, videos...): los stickers no le aplican enfriamiento
const isSoundOnly = (action) => { const steps = getSteps(action); return steps.length > 0 && steps.every(s => s.type === 'sound'); };

// Teclas de un paso de teclado, limpias: [{ key, modifiers, delay, repeat }] (las entradas sin tecla se descartan)
function normalizeKeys(step, defaultDelayMs = 80) {
  const list = Array.isArray(step?.keys) ? step.keys : [];
  return list.map(k => {
    const key = typeof k?.key === 'string' ? k.key.trim().toLowerCase() : '';
    if (!key) return null;
    const modifiers = [...new Set((Array.isArray(k.modifiers) ? k.modifiers : []).filter(m => MODIFIERS.includes(m)))];
    const delay = k.delay === undefined || k.delay === null || k.delay === '' ? defaultDelayMs : Math.min(MAX_WAIT_MS, Math.max(0, Number(k.delay) || 0));
    const repeat = Math.min(MAX_REPEAT, Math.max(1, parseInt(k.repeat, 10) || 1));
    return { key, modifiers, delay, repeat };
  }).filter(Boolean);
}

// Pulsaciones de una pasada del paso (suma de repeticiones)
const pressCount = (step) => normalizeKeys(step).reduce((n, k) => n + k.repeat, 0);

// Nombres para mostrar (Registro/Log en vivo). Misma tabla en frontend/src/services/actionSteps.js
const KEY_LABELS = {
  control: 'Ctrl', shift: 'Shift', alt: 'Alt', command: 'Win', space: 'Espacio', enter: 'Enter', escape: 'Esc', tab: 'Tab',
  backspace: 'Retroceso', delete: 'Supr', insert: 'Insert', home: 'Inicio', end: 'Fin', pageup: 'Re Pág', pagedown: 'Av Pág',
  up: 'Arriba', down: 'Abajo', left: 'Izquierda', right: 'Derecha', capslock: 'Bloq Mayús', printscreen: 'Impr Pant', menu: 'Menú',
};
const keyLabel = (key) => KEY_LABELS[key] || (/^numpad_/.test(key) ? `Num ${key.slice(7)}` : key.length === 1 ? key.toUpperCase() : key.toUpperCase());
const pressLabel = (k) => [...k.modifiers.map(keyLabel), keyLabel(k.key)].join('+') + (k.repeat > 1 ? ` x${k.repeat}` : '');
const keysLabel = (step) => normalizeKeys(step).map(pressLabel).join(', ');

module.exports = { getSteps, stepWait, hasStep, isSoundOnly, normalizeKeys, pressCount, keysLabel, MAX_WAIT_MS, MAX_REPEAT, MAX_PRESSES, MODIFIERS };
