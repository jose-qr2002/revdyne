// backend/services/actionDispatcher.js (corrección del nombre de módulo)
function dispatch(action, { times = 1, defaultDelayMs = 80 } = {}) {
  if (!action || !action.enabled) return { executed: false };
  const actionQueue = require('./actionQueue');
  const delay = action.delay !== undefined ? action.delay : defaultDelayMs;

  switch (action.type) {
    case 'keyboard': {
      if (!action.key) return { executed: false };
      for (let i = 0; i < times; i++) {
        actionQueue.enqueueKeyboardMacro(action.key, delay, action.sound, action.soundEveryKey || false);
      }
      return { executed: true, label: action.key };
    }
    case 'sound': {
      if (!action.sound) return { executed: false };
      actionQueue.enqueueSound(action.sound, delay);
      return { executed: true, label: action.sound };
    }
    default:
      console.warn(`[ACTION] Tipo no soportado todavía: "${action.type}" (acción: "${action.name}")`);
      return { executed: false };
  }
}

module.exports = { dispatch };