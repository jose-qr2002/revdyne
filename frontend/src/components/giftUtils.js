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
