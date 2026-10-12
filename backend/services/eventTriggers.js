// backend/services/eventTriggers.js
// Disparadores de las reglas de la pestaña Eventos y el filtro "¿quién puede activar el evento?".
//
// Regla: { id, trigger, condition, who?, match?, frequency?, cooldownSeconds?, actionIds, randomActionIds, enabled }
//
// trigger        condition                                   cuándo se activa
//   gift         ID del regalo (o de cualquier variante)      llega ese regalo
//   giftcoins    monedas de UNA unidad del regalo (número)    llega un regalo que vale exactamente esas monedas
//   like         cada N likes (número)                        se acumulan N likes (por regla)
//   follow       'any'                                        alguien sigue
//   share        'any'                                        alguien comparte el directo
//   join         'any'                                        alguien entra al directo
//   superfan     'any'                                        alguien se hace Super Fan
//   chat         'any'                                        cualquier comentario
//   chattext     texto del comentario (+ match)               un comentario concreto: match 'equals' (exacto) | 'contains' (lo contiene)
//   fanlevel     nivel (número)                               alguien sube EXACTAMENTE a ese nivel de fan
//   fanlevelmin  nivel (número)                               alguien sube a ese nivel de fan o a uno mayor
//   sticker      ID del sticker                               (se gestiona en la pestaña Stickers)
//
// who: { mode: 'all' | 'followers' | 'subscribers' | 'moderators' | 'user', username? }  (sin `who` = todos).
// Los roles (seguidor, suscriptor, moderador) solo los trae el chat, los regalos y los emotes; para el resto de eventos se usan los que ya se
// vieron de ese usuario en esta conexión (ver actorOf en tiktok/users.js). Si no se conocen, un filtro de rol NO deja pasar el evento.

const WHO_MODES = ['all', 'followers', 'subscribers', 'moderators', 'user'];
const CHAT_MATCHES = ['equals', 'contains'];

// Texto de un comentario para comparar: sin mayúsculas, sin espacios de más
const normalizeText = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeUser = (s) => String(s ?? '').trim().replace(/^@+/, '').toLowerCase();

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

// ¿El valor que llegó en el evento cumple la condición de la regla? (las reglas de regalo por ID tienen su propia lógica en eventEngine)
const MATCHERS = {
  giftcoins: (evt, value) => num(evt.condition) === num(value),
  fanlevel: (evt, value) => num(evt.condition) === num(value),
  fanlevelmin: (evt, value) => num(value) >= num(evt.condition),
  chattext: (evt, value) => {
    const wanted = normalizeText(evt.condition);
    if (!wanted) return false;
    const got = normalizeText(value);
    return evt.match === 'contains' ? got.includes(wanted) : got === wanted;
  },
};

function matches(evt, value) {
  const custom = MATCHERS[evt.trigger];
  if (custom) return custom(evt, value);
  return evt.condition === 'any' || String(evt.condition) === String(value);
}

// ¿La regla deja pasar a este usuario? `actor` = { key, username, roles: { follower, subscriber, moderator } } (o null si no se conoce)
function whoAllows(evt, actor) {
  const mode = evt.who?.mode;
  if (!mode || mode === 'all') return true;
  if (!actor) return false;
  switch (mode) {
    case 'followers': return !!actor.roles?.follower;
    case 'subscribers': return !!actor.roles?.subscriber;
    case 'moderators': return !!actor.roles?.moderator;
    case 'user': { const wanted = normalizeUser(evt.who.username); return !!wanted && normalizeUser(actor.username) === wanted; }
    default: return true; // un modo desconocido (de una versión futura) no bloquea
  }
}

module.exports = { matches, whoAllows, normalizeText, normalizeUser, WHO_MODES, CHAT_MATCHES };
