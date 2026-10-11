// Utilidades de regalos para la interfaz (sin JSX, para poder importarlas desde cualquier componente).

// Nivel visual de un regalo según su valor en monedas (antes: emojis 🌹🍪🎁✨💎🚀👑 duplicados en 3 archivos).
const TIERS = [
  { max: 5, icon: 'gift', color: '#ff7a90' },
  { max: 20, icon: 'gift', color: '#ffb36b' },
  { max: 50, icon: 'gift', color: '#7bd88f' },
  { max: 100, icon: 'sparkles', color: '#ffd24a' },
  { max: 500, icon: 'gem', color: '#5ecbff' },
  { max: 1000, icon: 'rocket', color: '#c58bff' },
  { max: Infinity, icon: 'crown', color: '#ffc400' },
];

export const giftTier = (coins) => TIERS.find(t => !coins || coins < t.max) || TIERS[TIERS.length - 1];

// Quita el emoji inicial de un texto (el servidor antepone alguno a ciertos nombres de evento: "👤 Nuevo Seguidor")
export const plainText = (text) => String(text ?? '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '');

// ---- Variantes de un mismo regalo ----
// TikTok usa varios IDs para el mismo regalo (según región o época) y el catálogo los acumula. Es "el mismo regalo" si el nombre (sin
// mayúsculas, comillas tipográficas ni espacios de más) y el precio coinciden. MISMA clave que backend/services/giftGroups.js.
// Un ID con `split: true` ("Tratar como regalo distinto" en el detalle) no se agrupa. MISMA clave que backend/services/giftGroups.js.
export const giftGroupKey = (gift, id) => {
  if (!gift?.name) return null;
  if (gift.split) return `id:${id}`;
  const name = String(gift.name).normalize('NFKC').replace(/[’‘`´]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
  return `${name}|${Number(gift.coins) || 0}`;
};

// Agrupa el catálogo ({ id: { name, coins, icon, seen? } }) en [idRepresentante, { ...regalo, ids: [todos los IDs] }].
// Representante: un ID visto en un directo real (es el que usa TikTok de verdad), si no uno con ícono, si no el menor.
export function groupGifts(catalog) {
  const groups = new Map();
  for (const [id, gift] of Object.entries(catalog || {})) {
    const key = giftGroupKey(gift, id) || `id:${id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([id, gift]);
  }
  const rank = ([, gift]) => (gift.seen ? 0 : gift.icon ? 1 : 2);
  return [...groups.values()].map(entries => {
    const sorted = [...entries].sort((a, b) => rank(a) - rank(b) || Number(a[0]) - Number(b[0]));
    const [id, gift] = sorted[0];
    const withIcon = sorted.find(([, g]) => g.icon);
    return [id, { ...gift, icon: gift.icon || withIcon?.[1].icon || '', ids: sorted.map(([i]) => i), seenIds: sorted.filter(([, g]) => g.seen).map(([i]) => i) }];
  });
}
