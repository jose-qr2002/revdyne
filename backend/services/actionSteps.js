// backend/services/actionSteps.js
// Una acción es una lista de PASOS que se ejecutan juntos: { name, enabled, steps: [{ type, wait?, ...campos del tipo }] }.
// Así una misma acción puede pulsar una tecla, sonar un audio y poner un video a la vez. Tipos de paso:
//   keyboard { key, delay (ms entre teclas), sound?, volume?, soundEveryKey? }   (el sonido opcional va sincronizado con las teclas)
//   sound    { sound, volume }
//   video    { video, screen 1-9, volume }
//   win      { mode: 'increase' | 'decrease', amount }
// `wait` (ms, opcional) retrasa ese paso respecto al momento en que se dispara la acción.
//
// Las acciones guardadas antes de los pasos (un solo `type`) las convierte backend/data/migrations.js al leer profiles.json.
// Lo mismo, en el panel: frontend/src/services/actionSteps.js.

const MAX_WAIT_MS = 60000;

function getSteps(action) {
  return Array.isArray(action?.steps) ? action.steps.filter(s => s && typeof s.type === 'string') : [];
}

const stepWait = (step) => Math.min(MAX_WAIT_MS, Math.max(0, parseInt(step.wait, 10) || 0));
const hasStep = (action, type) => getSteps(action).some(s => s.type === type);
// Solo suena un audio (sin teclas, videos...): los stickers no le aplican enfriamiento
const isSoundOnly = (action) => { const steps = getSteps(action); return steps.length > 0 && steps.every(s => s.type === 'sound'); };

module.exports = { getSteps, stepWait, hasStep, isSoundOnly, MAX_WAIT_MS };
