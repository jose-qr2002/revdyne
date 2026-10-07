// backend/services/giftStreaks.js
// Cuenta cuántas UNIDADES nuevas de regalo trae cada evento 'gift'.
//
// Los regalos con combo (rosas, donuts...) llegan como una serie de eventos de la misma ráfaga con
// repeatCount creciente (1 → 3 → 4 → 4✔), y el último (repeatEnd) repite el conteo final. Hay que sumar
// solo la diferencia. Cada ráfaga se identifica con su `groupId` (único por ráfaga); así:
//   - perder un evento de cierre no afecta a la ráfaga siguiente del mismo usuario y regalo,
//   - dos usuarios distintos nunca se mezclan,
//   - un cierre tardío o repetido no suma de más (la ráfaga se recuerda un tiempo tras cerrarse).
// Además se descartan mensajes repetidos por su msgId.
const DEFAULT_TTL_MS = 120000; // cuánto se recuerda una ráfaga o un mensaje
const PRUNE_EVERY_MS = 15000;
const MAX_ENTRIES = 5000;

function createGiftStreakCounter({ ttlMs = DEFAULT_TTL_MS, now = Date.now } = {}) {
  const streaks = new Map(); // clave de ráfaga -> { counted, at }
  const seenMsgs = new Map(); // msgId -> hora
  let lastPrune = 0;

  function prune(t) {
    if (t - lastPrune < PRUNE_EVERY_MS && streaks.size + seenMsgs.size < MAX_ENTRIES) return;
    lastPrune = t;
    for (const [k, s] of streaks) if (t - s.at > ttlMs) streaks.delete(k);
    for (const [k, at] of seenMsgs) if (t - at > ttlMs) seenMsgs.delete(k);
  }

  // userKey: identificador estable del usuario. Devuelve las unidades nuevas de este evento (0 = nada nuevo).
  function unitsFor(data, userKey) {
    const t = now();
    prune(t);

    const msgId = data.common?.msgId ? String(data.common.msgId) : '';
    if (msgId) {
      if (seenMsgs.has(msgId)) return 0; // el mismo mensaje entregado dos veces
      seenMsgs.set(msgId, t);
    }

    const gift = data.gift || {};
    const isCombo = (gift.type ?? data.giftType) === 1 || gift.combo === true;
    if (!isCombo) return 1; // regalo sin combo: un evento = una unidad

    const repeat = Math.max(1, Number(data.repeatCount) || 1);
    const isEnd = data.repeatEnd === 1 || data.repeatEnd === true;
    const groupId = data.groupId !== undefined && data.groupId !== null ? String(data.groupId) : '';
    const hasGroup = groupId !== '' && groupId !== '0';

    // Sin groupId no hay forma de separar ráfagas: se usa usuario+regalo y se olvida al cerrarse.
    const key = hasGroup ? `${userKey}|${data.giftId}|${groupId}` : `${userKey}|${data.giftId}`;
    const s = streaks.get(key) || { counted: 0, at: t };

    const units = repeat - s.counted;
    if (units > 0) s.counted = repeat;
    s.at = t;

    if (isEnd && !hasGroup) streaks.delete(key);
    else streaks.set(key, s);

    return Math.max(0, units);
  }

  const reset = () => { streaks.clear(); seenMsgs.clear(); };

  return { unitsFor, reset, size: () => streaks.size };
}

module.exports = { createGiftStreakCounter };
