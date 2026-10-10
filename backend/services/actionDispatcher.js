// backend/services/actionDispatcher.js
// Ejecuta una acción: todos sus pasos (tecla, sonido, video, win...) a la vez, cada uno con su retraso opcional (`wait`).
// Ver backend/services/actionSteps.js para el formato.
const logger = require('./logger');
const { getSteps, stepWait } = require('./actionSteps');

// ¿El paso tiene lo mínimo para hacer algo? (para los pasos con retraso, que se programan sin ejecutarse todavía)
function isValidStep(step) {
  switch (step.type) {
    case 'keyboard': return !!step.key;
    case 'sound': return !!step.sound;
    case 'video': return !!step.video;
    case 'win': return true;
    default: return false;
  }
}

function runStep(step, { times, defaultDelayMs, playbackStyle }, action) {
  const actionQueue = require('./actionQueue');

  switch (step.type) {
    case 'keyboard': {
      if (!step.key) return { executed: false };
      const delay = step.delay !== undefined && step.delay !== null && step.delay !== '' ? Number(step.delay) : defaultDelayMs;
      const volume = (step.volume ?? 100) / 100;
      for (let i = 0; i < times; i++) {
        actionQueue.enqueueKeyboardMacro(step.key, delay, step.sound || null, step.soundEveryKey || false, volume);
      }
      return { executed: true, label: step.key };
    }
    case 'sound': {
      if (!step.sound) return { executed: false };
      const volume = (step.volume ?? 100) / 100; // guardado como 0-100
      actionQueue.emitSoundBatch(step.sound, { times, playbackStyle, volume });
      return { executed: true, label: step.sound };
    }
    case 'video': {
      // Pantallas: reproduce un video de la biblioteca en la pantalla elegida. Con "times" (p. ej. un regalo de 5 unidades) se
      // pone en cola/se reemplaza según el ajuste de la pantalla; se lanza una vez por unidad, con un máximo para no inundar la cola.
      const videoService = require('./videoService');
      let result = { executed: false };
      for (let i = 0; i < Math.min(times, 10); i++) result = videoService.play(step.screen, { file: step.video, volume: step.volume ?? 100 });
      return result;
    }
    case 'win': {
      // Win Game: sube o baja el conteo del overlay. Con "times" se aplica una vez por unidad.
      const winService = require('./winService');
      const amount = Math.min(1000, Math.max(1, parseInt(step.amount, 10) || 1));
      const delta = (step.mode === 'decrease' ? -1 : 1) * amount * times;
      winService.adjustCount(delta);
      return { executed: true, label: `Win ${delta > 0 ? '+' : '−'}${Math.abs(delta)}` };
    }
    default:
      console.warn(`[ACTION] Tipo de paso no soportado todavía: "${step.type}" (acción: "${action.name}")`);
      logger.warn('acciones', 'Tipo de paso no soportado', { tipo: step.type, accion: action.name });
      return { executed: false };
  }
}

function dispatch(action, { times = 1, defaultDelayMs = 80, playbackStyle = 'sequential' } = {}) {
  if (!action || !action.enabled) return { executed: false };
  const opts = { times, defaultDelayMs, playbackStyle };
  const labels = [];
  let executed = false;

  for (const step of getSteps(action)) {
    const wait = stepWait(step);
    if (wait > 0) {
      if (!isValidStep(step)) continue;
      setTimeout(() => {
        try { runStep(step, opts, action); }
        catch (e) { logger.error('acciones', 'Error en un paso con retraso', { accion: action.name, tipo: step.type, error: e.message }); }
      }, wait);
      executed = true;
      labels.push(`${step.type === 'win' ? 'Win' : step.key || step.sound || step.video || step.type} (+${(wait / 1000).toFixed(1).replace(/\.0$/, '')}s)`);
      continue;
    }
    const result = runStep(step, opts, action);
    if (result.executed) {
      executed = true;
      if (result.label) labels.push(result.label);
    }
  }

  return executed ? { executed: true, label: labels.join(' + ') } : { executed: false };
}

module.exports = { dispatch };
