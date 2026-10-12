// backend/services/alertHold.js
// Alertas de regalos en combo: en vez de mostrar una alerta por cada incremento ("1 moneda", "3 monedas", "5 monedas"...), la alerta ESPERA a que
// termine el combo y se muestra UNA vez con el total final. Solo se difiere la alerta; el resto de pasos de la acción (teclas, sonido...) siguen
// reaccionando al instante a cada incremento.
//
// - Mientras el combo sigue, cada evento reemplaza lo guardado por el dato más reciente y reinicia una cuenta atrás de respaldo (IDLE_MS).
// - Al llegar el cierre del combo (repeatEnd) se muestra al momento: con el evento de cierre si trae unidades nuevas (dispatcher) o con lo último
//   guardado si el cierre llega sin unidades (`flushStreak`, lo llama el manejador de regalos).
// - Si el cierre nunca llega, o tarda más de IDLE_MS, la cuenta atrás de respaldo la muestra con el último dato. Si el cierre llega después con el
//   mismo total, no se repite (`alreadyShown`).
const IDLE_MS = 4000;
const SEP = '\u0001'; // separa la clave de la ráfaga del resto (la clave de ráfaga ya lleva "|")
const SHOWN_TTL_MS = 10 * 60 * 1000;
const MAX_SHOWN = 2000;

const held = new Map(); // clave -> { timer, show }
const shown = new Map(); // clave -> { total, at }: lo que ya se mostró, para no repetirlo si el cierre llega tarde

const holdKey = (streakKey, actionName, stepIndex) => `${streakKey}${SEP}${actionName}${SEP}${stepIndex}`;

function markShown(key, total) {
  const now = Date.now();
  shown.set(key, { total, at: now });
  if (shown.size > MAX_SHOWN) for (const [k, v] of shown) if (now - v.at > SHOWN_TTL_MS) shown.delete(k);
}

// Guarda (o reemplaza) la alerta de este combo. `show` la muestra; `total` = cantidad de la racha en este evento.
function hold(key, total, show) {
  const prev = held.get(key);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    held.delete(key);
    markShown(key, total);
    try { show(); } catch { /* el respaldo no debe tumbar nada */ }
  }, IDLE_MS);
  if (timer.unref) timer.unref();
  held.set(key, { timer, show, total });
}

// Cancela la alerta guardada (el combo terminó y se va a mostrar con el evento de cierre, o el combo se reinició)
function cancel(key) {
  const h = held.get(key);
  if (h) { clearTimeout(h.timer); held.delete(key); }
}

// ¿Esta alerta ya se mostró con este mismo total? (un cierre tardío tras el respaldo)
const alreadyShown = (key, total) => shown.get(key)?.total === total;

function release(key, total) { markShown(key, total); }

// El combo terminó sin unidades nuevas: se muestran las alertas guardadas de esa ráfaga con su último dato
function flushStreak(streakKey) {
  const prefix = `${streakKey}${SEP}`;
  let count = 0;
  for (const [key, h] of [...held]) {
    if (!key.startsWith(prefix)) continue;
    clearTimeout(h.timer);
    held.delete(key);
    markShown(key, h.total);
    try { h.show(); count++; } catch { /* ver arriba */ }
  }
  return count;
}

// Al conectar a un directo: nada de lo pendiente del anterior
function clear() {
  for (const h of held.values()) clearTimeout(h.timer);
  held.clear();
  shown.clear();
}

module.exports = { hold, cancel, release, alreadyShown, flushStreak, clear, holdKey, IDLE_MS, _held: held };
