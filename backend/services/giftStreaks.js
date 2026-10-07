// backend/services/giftStreaks.js
// Cuenta cuántas UNIDADES nuevas de regalo trae cada evento 'gift' y el total acumulado de su ráfaga.
//
// Los regalos con combo (rosas, donuts...) llegan como una serie de eventos de la misma ráfaga con
// repeatCount creciente (1 → 3 → 4 → 4✔), y el último (repeatEnd) repite el conteo final. Hay que sumar
// solo la diferencia. Cada ráfaga se identifica con su `groupId` (único por ráfaga); así:
//   - perder un evento de cierre no afecta a la ráfaga siguiente del mismo usuario y regalo,
//   - dos usuarios distintos nunca se mezclan,
//   - un cierre tardío o repetido no suma de más (la ráfaga se recuerda un tiempo tras cerrarse).
// Además se descartan mensajes repetidos por su msgId.
//
// `process()` devuelve { units, total, ended, combo, key }:
//   units = unidades nuevas de ESTE evento (lo que se usa para disparar acciones al instante),
//   total = unidades acumuladas de la ráfaga hasta ahora (la "racha" real: 24 rosas, no x2 x6 x8...).
// `onAnomaly(tipo, info)` (opcional) avisa de situaciones raras para el registro de errores; nunca altera el conteo.
const DEFAULT_TTL_MS = 120000; // cuánto se recuerda una ráfaga o un mensaje
const PRUNE_EVERY_MS = 15000;
const MAX_ENTRIES = 5000;
const BIG_JUMP = 30; // unidades que llegan de golpe en un solo evento (probable pérdida de eventos intermedios)

function createGiftStreakCounter({ ttlMs = DEFAULT_TTL_MS, now = Date.now, onAnomaly = null } = {}) {
  const streaks = new Map(); // clave de ráfaga -> { counted, ended, events, at, giftId, user }
  const seenMsgs = new Map(); // msgId -> hora
  let lastPrune = 0;
  let single = 0; // contador para dar clave única a los regalos sin combo

  const anomaly = (type, info) => { try { if (onAnomaly) onAnomaly(type, info); } catch { /* el aviso no debe afectar al conteo */ } };

  function prune(t) {
    if (t - lastPrune < PRUNE_EVERY_MS && streaks.size + seenMsgs.size < MAX_ENTRIES) return;
    lastPrune = t;
    for (const [k, s] of streaks) {
      if (t - s.at <= ttlMs) continue;
      // Una ráfaga que nunca recibió su evento de cierre: ya se contó, pero conviene dejar constancia
      if (!s.ended) anomaly('sin_cierre', { giftId: s.giftId, usuario: s.user, unidades: s.counted, eventos: s.events });
      streaks.delete(k);
    }
    for (const [k, at] of seenMsgs) if (t - at > ttlMs) seenMsgs.delete(k);
  }

  // userKey: identificador estable del usuario.
  function process(data, userKey) {
    const t = now();
    prune(t);

    const msgId = data.common?.msgId ? String(data.common.msgId) : '';
    if (msgId) {
      if (seenMsgs.has(msgId)) {
        anomaly('mensaje_repetido', { giftId: String(data.giftId), usuario: userKey });
        return { units: 0, total: 0, ended: false, combo: false, key: '', duplicate: true };
      }
      seenMsgs.set(msgId, t);
    }

    const gift = data.gift || {};
    const isCombo = (gift.type ?? data.giftType) === 1 || gift.combo === true;
    if (!isCombo) { // regalo sin combo: un evento = una unidad, y es su propia ráfaga
      single++;
      return { units: 1, total: 1, ended: true, combo: false, key: `single|${msgId || single}` };
    }

    const repeat = Math.max(1, Number(data.repeatCount) || 1);
    const isEnd = data.repeatEnd === 1 || data.repeatEnd === true;
    const groupId = data.groupId !== undefined && data.groupId !== null ? String(data.groupId) : '';
    const hasGroup = groupId !== '' && groupId !== '0';
    if (!hasGroup) anomaly('combo_sin_groupId', { giftId: String(data.giftId), usuario: userKey });

    // Sin groupId no hay forma de separar ráfagas: se usa usuario+regalo y se olvida al cerrarse.
    const key = hasGroup ? `${userKey}|${data.giftId}|${groupId}` : `${userKey}|${data.giftId}`;
    const s = streaks.get(key) || { counted: 0, ended: false, events: 0, at: t, giftId: String(data.giftId), user: userKey };

    const units = repeat - s.counted;
    const info = { giftId: s.giftId, usuario: userKey, groupId: hasGroup ? groupId : null, repeatCount: repeat, contadas: s.counted, cierre: isEnd };

    if (units < 0) {
      // Llegó un evento con un conteo MENOR que el ya contado: fuera de orden, o un cierre que trae menos de lo visto
      anomaly(isEnd ? 'cierre_menor_que_lo_contado' : 'conteo_retrocede', info);
    } else if (units >= BIG_JUMP && s.events > 0) {
      anomaly('salto_grande', { ...info, unidadesNuevas: units }); // faltaron eventos intermedios; las unidades SÍ se cuentan
    }

    if (units > 0) s.counted = repeat;
    s.events++;
    s.at = t;
    if (isEnd) s.ended = true;
    const ended = s.ended;

    if (isEnd && !hasGroup) streaks.delete(key);
    else streaks.set(key, s);

    return { units: Math.max(0, units), total: s.counted, ended, combo: true, key };
  }

  // Compatibilidad: solo las unidades nuevas
  const unitsFor = (data, userKey) => process(data, userKey).units;

  const reset = () => { streaks.clear(); seenMsgs.clear(); };

  return { process, unitsFor, reset, size: () => streaks.size, _prune: prune };
}

module.exports = { createGiftStreakCounter };
