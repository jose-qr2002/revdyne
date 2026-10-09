// backend/services/catalogService.js
const store = require('../data/store');

const GIFT_LIST_URL = 'https://webcast.tiktok.com/webcast/gift/list/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 15000;

function ensureGiftRegistered(giftId, { name, coins, icon }) {
  const catalog = store.loadCatalog();
  if (catalog[giftId]) return catalog;

  catalog[giftId] = { name, coins, icon };
  store.saveCatalog(catalog);
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

// Añade o actualiza en el catálogo los regalos recibidos de TikTok
function mergeGifts(gifts) {
  const catalog = store.loadCatalog();
  let nuevos = 0, actualizados = 0;

  gifts.forEach(gift => {
    const giftId = String(gift.id);
    const iconUrl = gift.image?.url_list?.[0] || gift.icon?.url_list?.[0] || '';
    if (!catalog[giftId]) nuevos++; else actualizados++;
    catalog[giftId] = { name: gift.name, coins: gift.diamond_count || 0, icon: iconUrl };
  });

  store.saveCatalog(catalog);
  return { nuevos, actualizados, total: Object.keys(catalog).length, catalog };
}

const syncGlobalGifts = async () => mergeGifts(await fetchGiftList());
const syncRoomGifts = async (roomId) => mergeGifts(await fetchGiftList({ roomId }));

// Botón "Actualizar" del catálogo: la lista general y, si la app ya se conectó alguna vez a un directo, también la de esa última sala
// (lastRoom.json). Una sala que ya terminó sigue respondiendo, así que sirve aunque ese directo ya no esté activo.
async function syncAllGifts() {
  const general = await syncGlobalGifts();
  const last = store.loadLastRoom();
  if (!last?.roomId) return { ...general, sala: null };
  try {
    const room = await syncRoomGifts(last.roomId);
    return { ...room, nuevos: general.nuevos + room.nuevos, sala: { usuario: last.username, idioma: last.idioma || null, nuevos: room.nuevos } };
  } catch (err) {
    return { ...general, sala: { usuario: last.username, idioma: last.idioma || null, error: err.message } };
  }
}

module.exports = { ensureGiftRegistered, giftListUrl, fetchGiftList, mergeGifts, syncGlobalGifts, syncRoomGifts, syncAllGifts };
