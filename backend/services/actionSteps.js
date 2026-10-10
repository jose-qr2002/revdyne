// backend/services/actionSteps.js
// Una acción es una lista de PASOS que se ejecutan juntos: { name, enabled, steps: [{ type, wait?, ...campos del tipo }] }.
// Así una misma acción puede pulsar una tecla, sonar un audio y poner un video a la vez. Tipos de paso:
//   keyboard { key, delay (ms entre teclas), sound?, volume?, soundEveryKey? }   (el sonido opcional va sincronizado con las teclas)
//   sound    { sound, volume }
//   video    { video, screen 1-9, volume }
//   win      { mode: 'increase' | 'decrease', amount }
// `wait` (ms, opcional) retrasa ese paso respecto al momento en que se dispara la acción.
//
// Las acciones guardadas antes de los pasos tienen un solo `type` con sus campos en la raíz: getSteps las convierte al vuelo
// (no se reescribe profiles.json; al editarlas desde la UI se guardan ya con pasos).
// MISMA lógica en frontend/src/services/actionSteps.js: si cambia aquí, cambiarla allí.

const MAX_WAIT_MS = 60000;

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
      const { name, enabled, ...rest } = action; // tipos que aún no existen (p. ej. l4d2_command): se conservan tal cual
      return action.type ? [rest] : [];
    }
  }
}

function getSteps(action) {
  if (!action) return [];
  return Array.isArray(action.steps) ? action.steps.filter(s => s && typeof s.type === 'string') : legacySteps(action);
}

const stepWait = (step) => Math.min(MAX_WAIT_MS, Math.max(0, parseInt(step.wait, 10) || 0));
const hasStep = (action, type) => getSteps(action).some(s => s.type === type);
// Solo suena un audio (sin teclas, videos...): los stickers no le aplican enfriamiento
const isSoundOnly = (action) => { const steps = getSteps(action); return steps.length > 0 && steps.every(s => s.type === 'sound'); };

module.exports = { getSteps, stepWait, hasStep, isSoundOnly, MAX_WAIT_MS };
