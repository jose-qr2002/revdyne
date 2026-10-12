// backend/services/actionDispatcher.js
// Ejecuta una acción: todos sus pasos (tecla, sonido, video, win...) a la vez, cada uno con su retraso opcional (`wait`).
// Ver backend/services/actionSteps.js para el formato.
const logger = require('./logger');
const { getSteps, stepWait, normalizeKeys, keysLabel, MAX_PRESSES } = require('./actionSteps');
const alertTemplate = require('./alertTemplate');
const alertHold = require('./alertHold');

// ¿El paso tiene lo mínimo para hacer algo? (para los pasos con retraso, que se programan sin ejecutarse todavía)
function isValidStep(step) {
  switch (step.type) {
    case 'keyboard': return normalizeKeys(step).length > 0;
    case 'sound': return !!step.sound;
    case 'video': return !!step.video;
    case 'image': return !!step.image;
    case 'alert': return true; // sin texto sigue siendo una alerta válida: foto y nombre
    case 'win': return true;
    default: return false;
  }
}

// Teclas: las pulsaciones del paso en orden (con sus repeticiones), repetidas `times` veces (p. ej. 5 rosas = 5 pasadas).
// `perPress`: paso de sonido con "en cada tecla"; su sonido suena en cada pulsación, sincronizado con la cola de teclas.
function runKeyboard(step, { times, defaultDelayMs }, perPress, action) {
  const actionQueue = require('./actionQueue');
  const keys = normalizeKeys(step, defaultDelayMs);
  if (!keys.length) return { executed: false };

  const onePass = keys.flatMap(k => Array.from({ length: k.repeat }, () => ({ key: k.key, modifiers: k.modifiers, delay: k.delay })));
  const presses = [];
  for (let i = 0; i < Math.max(1, times); i++) presses.push(...onePass);
  if (presses.length > MAX_PRESSES) {
    logger.warn('teclas', 'Demasiadas pulsaciones en un disparo: se recorta', { accion: action.name, pedidas: presses.length, maximo: MAX_PRESSES });
    presses.length = MAX_PRESSES;
  }
  actionQueue.enqueueKeyPresses(presses, { sound: perPress?.sound || null, volume: (perPress?.volume ?? 100) / 100 });
  return { executed: true, label: keysLabel(step) };
}

function runStep(step, opts, action, perPress, stepIndex = 0) {
  const actionQueue = require('./actionQueue');
  const { times, playbackStyle, context } = opts;

  switch (step.type) {
    case 'keyboard':
      return runKeyboard(step, opts, perPress, action);
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
    case 'image': {
      // Pantallas: muestra una imagen o GIF durante `duration` segundos; comparte cola con los videos. Con "times" se repite una vez por unidad (máx. 10)
      const videoService = require('./videoService');
      let result = { executed: false };
      for (let i = 0; i < Math.min(times, 10); i++) result = videoService.playImage(step.screen, { file: step.image, duration: step.duration });
      return result;
    }
    case 'alert': {
      // Alerta: texto con los datos del evento (opts.context: quién, regalo, cantidades, comentario). Una sola vez por disparo: la cantidad
      // de unidades ya va en {repeatcount}.
      const videoService = require('./videoService');
      const show = () => videoService.playAlert(step.screen, alertTemplate.buildPayload(step, context));
      // Regalo en combo: la alerta espera a que termine y sale UNA vez con el total final (ver alertHold.js). Un regalo sin combo, o cualquier
      // otro evento, la muestra al instante.
      const streak = context?.streak;
      if (streak?.combo && streak.key) {
        const key = alertHold.holdKey(streak.key, action.name, stepIndex);
        if (!streak.ended) {
          alertHold.hold(key, context.repeatCount, show);
          return { executed: true, label: 'Alerta (al terminar el combo)' };
        }
        alertHold.cancel(key);
        if (alertHold.alreadyShown(key, context.repeatCount)) return { executed: true, label: 'Alerta' }; // ya salió por el respaldo con este total
        alertHold.release(key, context.repeatCount);
      }
      return show();
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

const delayedLabel = (step) => (step.type === 'keyboard' ? keysLabel(step) : step.type === 'win' ? 'Win' : step.sound || step.video || step.image || (step.type === 'alert' ? 'Alerta' : step.type));

// `context`: datos del evento que dispara la acción (ver alertTemplate.js); lo usan las alertas
function dispatch(action, { times = 1, defaultDelayMs = 80, playbackStyle = 'sequential', context = null } = {}) {
  if (!action || !action.enabled) return { executed: false };
  const opts = { times, defaultDelayMs, playbackStyle, context };
  const steps = getSteps(action);
  const labels = [];
  let executed = false;

  // Sonido "en cada tecla": solo tiene sentido si la acción tiene teclas; entonces suena con cada pulsación (y no aparte, una vez)
  const hasKeys = steps.some(s => s.type === 'keyboard' && normalizeKeys(s).length);
  const perPress = hasKeys ? steps.find(s => s.type === 'sound' && s.everyKey && s.sound) : null;

  for (const step of steps) {
    if (step === perPress) continue;
    const wait = stepWait(step);
    if (wait > 0) {
      if (!isValidStep(step)) continue;
      setTimeout(() => {
        try { runStep(step, opts, action, perPress, steps.indexOf(step)); }
        catch (e) { logger.error('acciones', 'Error en un paso con retraso', { accion: action.name, tipo: step.type, error: e.message }); }
      }, wait);
      executed = true;
      labels.push(`${delayedLabel(step)} (+${(wait / 1000).toFixed(1).replace(/\.0$/, '')}s)`);
      continue;
    }
    const result = runStep(step, opts, action, perPress, steps.indexOf(step));
    if (result.executed) {
      executed = true;
      if (result.label) labels.push(result.label);
    }
  }

  return executed ? { executed: true, label: labels.join(' + ') } : { executed: false };
}

module.exports = { dispatch };
