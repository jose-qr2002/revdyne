// backend/services/actionDispatcher.js (corrección del nombre de módulo)
const logger = require('./logger');

function dispatch(action, { times = 1, defaultDelayMs = 80, playbackStyle = 'sequential' } = {}) {
  if (!action || !action.enabled) return { executed: false };
  const actionQueue = require('./actionQueue');
  const delay = action.delay !== undefined ? action.delay : defaultDelayMs;

  switch (action.type) {
    case 'keyboard': {
      if (!action.key) return { executed: false };
      const volume = (action.volume ?? 100) / 100;
      for (let i = 0; i < times; i++) {
        actionQueue.enqueueKeyboardMacro(action.key, delay, action.sound, action.soundEveryKey || false, volume);
      }
      return { executed: true, label: action.key };
    }
    case 'sound': {
      if (!action.sound) return { executed: false };
      const volume = (action.volume ?? 100) / 100; // action.volume guardado como 0-100
      actionQueue.emitSoundBatch(action.sound, { times, playbackStyle, volume });
      return { executed: true, label: action.sound };
    }
    case 'win': {
      // Win Game: sube o baja el conteo del overlay. Con "times" (p. ej. un regalo de 5 unidades) se aplica una vez por unidad.
      const winService = require('./winService');
      const amount = Math.min(1000, Math.max(1, parseInt(action.amount, 10) || 1));
      const delta = (action.mode === 'decrease' ? -1 : 1) * amount * times;
      winService.adjustCount(delta);
      return { executed: true, label: `Win ${delta > 0 ? '+' : '−'}${Math.abs(delta)}` };
    }
    default:
      console.warn(`[ACTION] Tipo no soportado todavía: "${action.type}" (acción: "${action.name}")`);
      logger.warn('acciones', 'Tipo de acción no soportado', { tipo: action.type, accion: action.name });
      return { executed: false };
  }
}

module.exports = { dispatch };