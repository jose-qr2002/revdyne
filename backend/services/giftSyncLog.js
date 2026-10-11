// backend/services/giftSyncLog.js
// Historial de obtenciones de regalos (herramienta TEMPORAL para ir completando el catálogo probando con directos de varias regiones).
// Cada obtención = una "corrida": la lista general, la lista de una sala (con su streamer e idioma) o regalos nuevos vistos en un directo.
// Guarda solo IDs y cambios (los datos del regalo se leen del catálogo al mostrarlos), en giftSyncLog.json, con un máximo de corridas.
//
// Corrida: { at, source: 'general' | 'sala' | 'evento', roomId?, username?, idioma?, listSize?, total?,
//            nuevos: [ids], cambios: [{ id, name?: [antes, después], coins?: [antes, después], icon?: [url antes, url ahora] }] }
const store = require('../data/store');

const MAX_RUNS = 60;
const EVENT_MERGE_MS = 10 * 60 * 1000; // los regalos nuevos vistos en directo seguidos se juntan en una sola corrida

const load = () => {
  const data = store.loadGiftSyncLog();
  return { runs: Array.isArray(data?.runs) ? data.runs : [] };
};
const save = (log) => { log.runs = log.runs.slice(0, MAX_RUNS); store.saveGiftSyncLog(log); };

function record(run) {
  const log = load();
  log.runs.unshift({ at: Date.now(), ...run });
  save(log);
}

// Un regalo que no estaba en el catálogo llegó en un evento real
function recordEventGift(giftId) {
  const log = load();
  const last = log.runs[0];
  if (last && last.source === 'evento' && Date.now() - last.at < EVENT_MERGE_MS) {
    if (!last.nuevos.includes(giftId)) last.nuevos.push(giftId);
    last.at = Date.now();
  } else {
    log.runs.unshift({ at: Date.now(), source: 'evento', nuevos: [giftId], cambios: [] });
  }
  save(log);
}

// El idioma del streamer se conoce unos segundos DESPUÉS de traer la lista de su sala: se anota en la corrida de esa sala
function noteLanguage(roomId, idioma) {
  if (!idioma) return;
  const log = load();
  const run = log.runs.find(r => r.source === 'sala' && String(r.roomId) === String(roomId) && !r.idioma);
  if (!run) return;
  run.idioma = idioma;
  save(log);
}

const list = () => load().runs;

module.exports = { record, recordEventGift, noteLanguage, list, MAX_RUNS };
