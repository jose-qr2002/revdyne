// backend/services/actionDispatcher.js (corrección del nombre de módulo)
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
    default:
      console.warn(`[ACTION] Tipo no soportado todavía: "${action.type}" (acción: "${action.name}")`);
      return { executed: false };
  }
}

module.exports = { dispatch };