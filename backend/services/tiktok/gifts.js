// backend/services/tiktok/gifts.js
// Evento "gift": cuenta las unidades nuevas de cada ráfaga, alimenta metas/tops/rankings y dispara las reglas de regalo.
const ctx = require('./context');
const { getUsername, rankUser } = require('./users');
const catalogService = require('../catalogService');
const overlayService = require('../overlayService');
const rankingService = require('../rankingService');
const topService = require('../topService');
const { createGiftStreakCounter } = require('../giftStreaks');
const logger = require('../logger');
const giftGroups = require('../giftGroups');

// Anomalías del contador de regalos -> registro. Nivel: warn si pudo afectar al conteo, info si solo es informativo.
const GIFT_ANOMALIES = {
  mensaje_repetido: ['info', 'Mensaje de regalo repetido (se ignoró)'],
  conteo_retrocede: ['warn', 'Llegó un regalo con repeatCount menor que el ya contado (fuera de orden)'],
  cierre_menor_que_lo_contado: ['warn', 'El evento de cierre trae menos unidades que las ya contadas'],
  salto_grande: ['info', 'Una ráfaga saltó muchas unidades en un solo evento (faltaron eventos intermedios; sí se contaron)'],
  combo_sin_groupId: ['warn', 'Regalo con combo sin groupId (no se pueden separar ráfagas)'],
  sin_cierre: ['info', 'Ráfaga de regalos que nunca recibió su evento de cierre (ya se había contado)'],
};
const giftStreaks = createGiftStreakCounter({
  onAnomaly: (type, info) => {
    const [level, text] = GIFT_ANOMALIES[type] || ['warn', `Anomalía de regalo: ${type}`];
    logger[level]('regalos', text, info);
  },
}); // unidades nuevas por evento de regalo (ráfagas por groupId)

// Una vez por ID y sesión: qué ID trae TikTok de verdad cuando el regalo tiene varios en el catálogo (sirve para diagnosticar reglas)
const variantsLogged = new Set();
function logVariants(giftId, giftName, coins) {
  if (variantsLogged.has(giftId)) return;
  variantsLogged.add(giftId);
  const variants = giftGroups.variantsOf(giftId);
  if (variants.length > 1) logger.info('regalos', 'Regalo recibido con varios IDs en el catálogo (una regla sirve para todos)', { giftId, nombre: giftName, monedas: coins, variantes: variants.join(',') });
}

function handleGift(data) {
  const giftObj = data.gift || {};
  const giftId = String(data.giftId);
  const giftName = giftObj.name || `Gift #${giftId}`;
  const coins = giftObj.diamondCount || 0;
  const sender = getUsername(data);
  const giftIcon = giftObj.icon?.urlList?.[0] || giftObj.image?.urlList?.[0] || data.pictureUrl || '';

  catalogService.ensureGiftRegistered(giftId, { name: giftName, coins, icon: giftIcon });
  logVariants(giftId, giftName, coins);

  // Unidades nuevas de este evento. El usuario se identifica por su id estable (el displayId puede faltar o repetirse).
  const userKey = String(data.user?.id || data.user?.userId || data.user?.secUid || sender);
  if (!data.gift) logger.warn('regalos', 'Evento de regalo sin detalles del regalo (monedas desconocidas)', { giftId, usuario: sender });
  const streak = giftStreaks.process(data, userKey);
  const newCount = streak.units;
  logger.debug('regalos', 'evento', { giftId, nombre: giftName, monedas: coins, repeatCount: data.repeatCount, repeatEnd: data.repeatEnd, groupId: String(data.groupId), usuario: sender, unidadesNuevas: newCount });
  if (newCount <= 0) return;

  // La meta de monedas cuenta todos los regalos, también los que no llegan al mínimo de monedas de las reglas.
  overlayService.addCoins(newCount * coins);
  rankingService.record('gifters', rankUser(data), newCount * coins);

  // Mejor regalo / mejor combo: usan el total acumulado de la ráfaga (no el incremento de este evento)
  topService.record({
    key: streak.key, giftId, giftName, perUnit: coins, units: streak.total,
    icon: giftObj.image?.urlList?.[0] || giftObj.icon?.urlList?.[0] || '',
    user: { id: userKey, nickname: data.user?.nickname, username: data.user?.displayId || sender },
  });

  if (coins < (ctx.settings?.minCoins || 0)) return;

  const result = ctx.executeEventActions('gift', giftId, newCount);

  ctx.io.emit('giftReceived', {
    giftId, giftName, coins, sender, newCount,
    // Racha completa hasta ahora: el log agrupa por groupId y muestra "Rose ×24" en vez de x2, x6, x8...
    groupId: streak.combo ? String(data.groupId) : '', streakTotal: streak.total, streakEnded: streak.ended,
    key: result.keyExecuted || 'Ninguna',
    pressed: result.actionExecuted,
    timestamp: Date.now()
  });
}

// Al conectar (también al reconectar): las ráfagas a medias de la conexión anterior ya no cuentan
function reset() {
  variantsLogged.clear();
  giftStreaks.reset();
}

module.exports = { handleGift, reset };
