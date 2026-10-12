// backend/services/tiktok/context.js
// Lo que comparten los manejadores de eventos de TikTok: el Socket.IO del panel y los ajustes (config.json en memoria).
// tiktokService.init() lo rellena al arrancar.
const eventEngine = require('../eventEngine');
const frequency = require('./frequency');

let io = null;
let settings = null;

function set(ioInstance, settingsRef) {
  io = ioInstance;
  settings = settingsRef;
}

const defaultDelayMs = () => settings?.keyDelayMs || 80;

// Ejecuta todas las reglas que coinciden con un disparador (regalo, seguidor...). `times` = unidades (5 rosas = 5).
// `context`: datos del evento para las alertas (quién, regalo, cantidades, comentario; ver alertTemplate.js).
// `opts.actor`: quién hizo el evento, para el filtro "¿quién puede activarlo?" de cada regla (ver users.actorOf).
// `opts.frequency`: modo por defecto de frecuencia por usuario ('once' | 'always' | 'cooldown') para los disparadores que se repiten mucho (compartir,
//   entrar, comentar...); la regla puede traer el suyo. Sin este dato no se aplica frecuencia.
// Devuelve si se ejecutó algo y la etiqueta para el Log en vivo (varias reglas se unen con " + ").
function executeEventActions(triggerType, conditionValue, times = 1, context = null, opts = {}) {
  const labels = [];
  let actionExecuted = false;
  for (const { evt, actions } of eventEngine.findMatchingEvents(triggerType, conditionValue, opts.actor || null)) {
    if (opts.frequency && !frequency.passes(evt, opts.actor?.key || '', opts.frequency)) continue;
    const result = eventEngine.runEvent(evt, actions, { times, defaultDelayMs: defaultDelayMs(), context });
    if (result.executed) {
      actionExecuted = true;
      if (result.label) labels.push(result.label);
    }
  }
  return { actionExecuted, keyExecuted: labels.join(' + ') || null };
}

// Una línea en el Log en vivo para un evento que no es un regalo (entrar, comentar, subir de nivel...)
function emitLog(id, name, sender, label) {
  io?.emit('giftReceived', { giftId: id, giftName: name, coins: 0, sender, newCount: 1, key: label || 'Ninguna', pressed: true, timestamp: Date.now() });
}

module.exports = {
  set,
  get io() { return io; },
  get settings() { return settings; },
  defaultDelayMs,
  executeEventActions,
  emitLog,
};
