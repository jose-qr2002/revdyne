// Disparadores de las reglas de la pestaña Eventos (formato y significado en backend/services/eventTriggers.js).

// ¿Quién puede activar el evento? (el filtro "Top Gifters Rank" queda para más adelante)
export const WHO_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'followers', label: 'Seguidores' },
  { id: 'subscribers', label: 'Suscriptores' },
  { id: 'moderators', label: 'Moderadores' },
  { id: 'user', label: 'Usuario específico' },
];

// ¿Por qué se activará el evento? (Donor Level Up y Emotes quedan para más adelante; los stickers siguen en su pestaña)
export const TRIGGER_GROUPS = [
  { label: 'General', items: [
    { id: 'join', label: 'Join (entra al directo)', icon: 'eye' },
    { id: 'share', label: 'Share (comparte el directo)', icon: 'share' },
    { id: 'follow', label: 'Follow (nuevo seguidor)', icon: 'user' },
    { id: 'superfan', label: 'Super Fan', icon: 'crown' },
    { id: 'like', label: 'Likes (taps)', icon: 'heart' },
  ] },
  { label: 'Chat', items: [
    { id: 'chat', label: 'Chat (global)', icon: 'message' },
    { id: 'chattext', label: 'Chat (comentario)', icon: 'message' },
  ] },
  { label: 'Fan Level Up', items: [
    { id: 'fanlevel', label: 'Fan Level Up (específico)', icon: 'star' },
    { id: 'fanlevelmin', label: 'Fan Level Up (mínimo)', icon: 'star' },
  ] },
  { label: 'Gift', items: [
    { id: 'gift', label: 'Gift (regalo específico)', icon: 'gift' },
    { id: 'giftcoins', label: 'Gift (moneda específica)', icon: 'coin' },
  ] },
];

// Disparadores que se repiten mucho: llevan frecuencia por usuario (una vez, siempre o con enfriamiento)
export const FREQUENCY_TRIGGERS = ['join', 'share', 'superfan', 'chat', 'chattext'];
export const defaultFrequency = (trigger) => (trigger === 'chat' || trigger === 'chattext' ? 'always' : 'once');

export const CHAT_MATCHES = { equals: 'Es exactamente', contains: 'Contiene' };

// Texto corto de la frecuencia de una regla (para la lista)
export function frequencyLabel(evt) {
  const mode = evt.frequency || defaultFrequency(evt.trigger);
  if (mode === 'always') return 'siempre';
  if (mode === 'cooldown') return `cada ${evt.cooldownSeconds}s por usuario`;
  return '1 vez por usuario';
}

export function whoLabel(evt) {
  const mode = evt.who?.mode;
  if (!mode || mode === 'all') return null;
  if (mode === 'user') return `Solo @${String(evt.who.username || '').replace(/^@+/, '')}`;
  return `Solo ${({ followers: 'seguidores', subscribers: 'suscriptores', moderators: 'moderadores' })[mode] || mode}`;
}
