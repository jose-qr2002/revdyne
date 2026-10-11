// backend/services/catalogService.js
const store = require('../data/store');
const { applyOverrides } = require('../data/giftOverrides');
const giftSyncLog = require('./giftSyncLog');

const GIFT_LIST_URL = 'https://webcast.tiktok.com/webcast/gift/list/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 15000;

// Hash de la imagen: archivo sin ruta, sin sufijo de CDN (~tplv...) y sin extensión (igual que en GiftDetailModal del panel)
const iconHash = (url) => String(url || '').split('/').pop().split('~')[0].replace(/[.][a-z0-9]+$/i, '');

function ensureGiftRegistered(giftId, { name, coins, icon }) {
  const catalog = store.loadCatalog();
  if (catalog[giftId]) {
    // Primera vez que este ID llega en un evento real: se marca (así se sabe cuál de las variantes usa TikTok de verdad). Se guarda una sola vez.
    if (!catalog[giftId].seen) { catalog[giftId].seen = true; store.saveCatalog(catalog); }
    return catalog;
  }

  catalog[giftId] = { name, coins, icon, seen: true };
  applyOverrides(catalog);
  store.saveCatalog(catalog);
  giftSyncLog.recordEventGift(String(giftId));
  return catalog;
}

// Lista de regalos de TikTok. Sin roomId es la lista general (la misma para todos, sea cual sea la región); con roomId, la de esa sala,
// que además trae los regalos propios del streamer o de su región. Esta consulta no necesita firma (a diferencia de enableExtendedGiftInfo
// de la librería, que pasa por un servicio de pago).
const giftListUrl = (roomId) => `${GIFT_LIST_URL}?aid=1988${roomId ? `&room_id=${encodeURIComponent(roomId)}` : ''}`;

async function fetchGiftList({ roomId } = {}) {
  const url = giftListUrl(roomId);
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error('Error de conexión con TikTok');
  const json = await response.json();
  const gifts = json.data?.gifts || [];
  if (gifts.length === 0) throw new Error('TikTok no devolvió regalos');
  return gifts;
}

// Añade o actualiza en el catálogo los regalos recibidos de TikTok y anota la obtención en el historial (giftSyncLog).
// `source`: de qué lista vienen ('general' | 'sala'); se acumula en catalog[id].src para el detalle del regalo.
// `meta`: datos de la sala para el historial ({ roomId, username, idioma }).
// `actualizados` = regalos que CAMBIARON de verdad (nombre, monedas o foto), no todos los que ya estaban.
function mergeGifts(gifts, source = null, meta = {}) {
  const catalog = store.loadCatalog();
  const nuevos = [], cambios = [];

  gifts.forEach(gift => {
    const giftId = String(gift.id);
    const iconUrl = gift.image?.url_list?.[0] || gift.icon?.url_list?.[0] || '';
    const coins = gift.diamond_count || 0;
    const prev = catalog[giftId];
    if (!prev) {
      nuevos.push(giftId);
    } else {
      const change = {};
      if (prev.name !== gift.name) change.name = [prev.name, gift.name];
      if (prev.coins !== coins) change.coins = [prev.coins, coins];
      if (iconUrl && iconHash(prev.icon) !== iconHash(iconUrl)) change.icon = [prev.icon || '', iconUrl]; // URLs: foto de antes y de ahora
      if (Object.keys(change).length) cambios.push({ id: giftId, ...change });
    }
    // Se conserva lo que ya hubiera (p. ej. `seen`) y el ícono anterior si la lista no trae uno
    const old = prev || {};
    const src = source ? [...new Set([...(old.src || []), source])] : old.src;
    catalog[giftId] = { ...old, name: gift.name, coins, icon: iconUrl || old.icon || '', ...(src ? { src } : {}) };
  });

  applyOverrides(catalog);
  store.saveCatalog(catalog);
  const total = Object.keys(catalog).length;
  if (source) giftSyncLog.record({ source, ...meta, listSize: gifts.length, total, nuevos, cambios });
  return { nuevos: nuevos.length, actualizados: cambios.length, total, catalog };
}

const syncGlobalGifts = async () => mergeGifts(await fetchGiftList(), 'general');
const syncRoomGifts = async (roomId, meta = {}) => mergeGifts(await fetchGiftList({ roomId }), 'sala', { roomId: String(roomId), ...meta });

// Marca (o desmarca) un ID como regalo distinto: deja de agruparse con los de su mismo nombre y precio
function setSplit(giftId, split) {
  const catalog = store.loadCatalog();
  const id = String(giftId);
  if (!catalog[id]) return null;
  catalog[id].split = !!split; // false explícito: "volver a agrupar" manda sobre los valores por defecto de giftOverrides.json
  store.saveCatalog(catalog);
  return catalog;
}

// Botón "Actualizar" del catálogo: la lista general y, si la app ya se conectó alguna vez a un directo, también la de esa última sala
// (lastRoom.json). Una sala que ya terminó sigue respondiendo, así que sirve aunque ese directo ya no esté activo.
async function syncAllGifts() {
  const general = await syncGlobalGifts();
  const last = store.loadLastRoom();
  if (!last?.roomId) return { ...general, sala: null };
  try {
    const room = await syncRoomGifts(last.roomId, { username: last.username, idioma: last.idioma || null });
    return { ...room, nuevos: general.nuevos + room.nuevos, sala: { usuario: last.username, idioma: last.idioma || null, nuevos: room.nuevos } };
  } catch (err) {
    return { ...general, sala: { usuario: last.username, idioma: last.idioma || null, error: err.message } };
  }
}

module.exports = { noteRoomLanguage: giftSyncLog.noteLanguage, setSplit, ensureGiftRegistered, giftListUrl, fetchGiftList, mergeGifts, syncGlobalGifts, syncRoomGifts, syncAllGifts };
