// backend/services/giftGroups.js
// TikTok usa VARIOS IDs para el mismo regalo (según región o época: "It's corn" es el 6928 en una sala y el 7096 en la lista general),
// y el catálogo acumula todos. Un regalo es "el mismo" si tiene igual nombre (sin mayúsculas, comillas tipográficas ni espacios de más) e
// igual precio en monedas: ese es el grupo. Una regla de regalo guarda un ID, pero se dispara con cualquier ID de su grupo.
// Un ID marcado `split: true` en el catálogo (botón "Tratar como regalo distinto" del detalle) es un regalo aparte: no se agrupa.
// MISMA clave en frontend/src/components/giftUtils.js (`giftGroupKey`): si cambia aquí, cambiarla allí.
const store = require('../data/store');

const normName = (s) => String(s ?? '').normalize('NFKC').replace(/[’‘`´]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const groupKey = (gift, id) => (gift && gift.name ? (gift.split ? `id:${id}` : `${normName(gift.name)}|${Number(gift.coins) || 0}`) : null);

// id -> clave de grupo. Se recalcula solo cuando cambia el catálogo (peekCatalog devuelve el MISMO objeto mientras no cambie el archivo)
const cache = new WeakMap();
function index(catalog) {
  let idx = cache.get(catalog);
  if (!idx) {
    idx = { keyOf: new Map(), idsOf: new Map() };
    for (const [id, gift] of Object.entries(catalog)) {
      const key = groupKey(gift, id);
      if (!key) continue;
      idx.keyOf.set(String(id), key);
      if (!idx.idsOf.has(key)) idx.idsOf.set(key, []);
      idx.idsOf.get(key).push(String(id));
    }
    cache.set(catalog, idx);
  }
  return idx;
}

// ¿Son el mismo regalo (mismo ID o variantes del mismo grupo)?
function sameGift(idA, idB) {
  const a = String(idA), b = String(idB);
  if (a === b) return true;
  const { keyOf } = index(store.peekCatalog());
  const keyA = keyOf.get(a);
  return !!keyA && keyA === keyOf.get(b);
}

// Todos los IDs del grupo de un regalo (incluido él mismo)
function variantsOf(id) {
  const { keyOf, idsOf } = index(store.peekCatalog());
  const key = keyOf.get(String(id));
  return key ? idsOf.get(key) : [String(id)];
}

module.exports = { sameGift, variantsOf, groupKey, normName };
