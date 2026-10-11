// backend/services/tiktok/context.js
// Lo que comparten los manejadores de eventos de TikTok: el Socket.IO del panel y los ajustes (config.json en memoria).
// tiktokService.init() lo rellena al arrancar.
const eventEngine = require('../eventEngine');

let io = null;
let settings = null;

function set(ioInstance, settingsRef) {
  io = ioInstance;
  settings = settingsRef;
}

const defaultDelayMs = () => settings?.keyDelayMs || 80;

// Ejecuta todas las reglas que coinciden con un disparador (regalo, seguidor...). `times` = unidades (5 rosas = 5).
// Devuelve si se ejecutó algo y la etiqueta para el Log en vivo (varias reglas se unen con " + ").
function executeEventActions(triggerType, conditionValue, times = 1) {
  const labels = [];
  let actionExecuted = false;
  for (const { evt, actions } of eventEngine.findMatchingEvents(triggerType, conditionValue)) {
    const result = eventEngine.runEvent(evt, actions, { times, defaultDelayMs: defaultDelayMs() });
    if (result.executed) {
      actionExecuted = true;
      if (result.label) labels.push(result.label);
    }
  }
  return { actionExecuted, keyExecuted: labels.join(' + ') || null };
}

module.exports = {
  set,
  get io() { return io; },
  get settings() { return settings; },
  defaultDelayMs,
  executeEventActions,
};
