// backend/services/tiktok/users.js
// Cómo se identifica y se nombra al usuario de un evento de TikTok (sin estado).

const getUsername = (data) => (data.user?.displayId) || data.uniqueId || (data.user?.nickname) || 'alguien';

function normalizeForSpeech(str) {
  if (!str) return '';
  return str
    .normalize('NFKC')                          // 𝓒𝓸𝓸𝓵 → Cool (arregla fuentes estilizadas)
    .replace(/\p{Extended_Pictographic}/gu, '')  // quita emojis
    .trim();
}

function isSpeakable(normalizedStr) {
  if (!normalizedStr) return false;
  const letters = normalizedStr.match(/\p{L}|\p{N}/gu) || [];
  // al menos un tercio del texto debe ser letras/números reales
  return letters.length > 0 && (letters.length / normalizedStr.length) >= 0.34;
}

// Nombre para leer en voz alta: el apodo si se puede pronunciar; si no, el @usuario
function getSpeakableName(data) {
  const nickname = data.user?.nickname;
  const fallbackUsername = data.user?.displayId || data.uniqueId || 'alguien';

  if (nickname) {
    const normalized = normalizeForSpeech(nickname);
    if (isSpeakable(normalized)) {
      return normalized;
    }
  }
  return fallbackUsername;
}

// Quién hizo el evento, para las alertas: nombre visible, @usuario y foto (el evento "share" no trae foto: queda vacía)
function alertUser(data) {
  const u = data?.user || {};
  return {
    nickname: u.nickname || '',
    username: u.displayId || u.uniqueId || data?.uniqueId || '',
    avatar: u.avatarThumb?.urlList?.[0] || u.avatarMedium?.urlList?.[0] || u.avatarLarge?.urlList?.[0] || '',
  };
}

// ---- Actor: quién hizo el evento y qué es para el streamer (seguidor, suscriptor, moderador), para el filtro "¿quién puede activar el evento?" ----
// Solo el chat, los regalos y los emotes traen `userIdentity`. Para el resto (entrar, likes, compartir...) se usa lo último que se vio de ese
// usuario en esta conexión (roleCache); si no se vio nunca, no se conoce y un filtro de rol no lo deja pasar. No se adivinan roles a partir de
// otros campos del usuario (no hay forma de comprobarlos).
const roleCache = new Map(); // clave de usuario -> { follower, subscriber, moderator }
const MAX_ROLE_CACHE = 20000;

// `extra`: roles que ya se saben por el propio evento (p. ej. quien acaba de seguir es seguidor)
function actorOf(data, extra = {}) {
  const u = data?.user || {};
  const key = String(u.id || u.userId || u.secUid || u.displayId || u.uniqueId || data?.uniqueId || '');
  const identity = data?.userIdentity || null;
  let roles = { follower: false, subscriber: false, moderator: false };
  if (identity) {
    roles = {
      follower: !!(identity.isFollowerOfAnchor || identity.isMutualFollowingWithAnchor),
      subscriber: !!identity.isSubscriberOfAnchor,
      moderator: !!(identity.isModeratorOfAnchor || identity.isAnchor), // el propio streamer cuenta como moderador
    };
  } else if (key && roleCache.has(key)) {
    roles = { ...roleCache.get(key) };
  }
  roles = { follower: roles.follower || !!extra.follower, subscriber: roles.subscriber || !!extra.subscriber, moderator: roles.moderator || !!extra.moderator };
  if (key && (identity || extra.follower || extra.subscriber || extra.moderator)) {
    roleCache.set(key, roles);
    if (roleCache.size > MAX_ROLE_CACHE) roleCache.delete(roleCache.keys().next().value);
  }
  return { key, username: u.displayId || u.uniqueId || data?.uniqueId || '', roles };
}

// Mensajes sin campo de usuario fijo (Super Fan): se busca el primer objeto "usuario" dentro del mensaje (con poca profundidad)
function findUserDeep(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return null;
  const u = obj.user;
  if (u && typeof u === 'object' && (u.nickname || u.displayId || u.uniqueId)) return u;
  for (const v of Object.values(obj)) {
    const found = findUserDeep(v, depth + 1);
    if (found) return found;
  }
  return null;
}

const resetActors = () => roleCache.clear();

// Usuario de un evento en el formato de los tops: clave estable (id), nombre visible, @usuario y avatar
function rankUser(data) {
  const u = data?.user || {};
  const key = u.id || u.userId || u.secUid || u.displayId || u.uniqueId;
  const username = u.displayId || u.uniqueId || '';
  return {
    key: key ? String(key) : '',
    name: u.nickname || username,
    username,
    avatar: u.avatarThumb?.urlList?.[0] || u.avatarMedium?.urlList?.[0] || u.avatarLarge?.urlList?.[0] || '',
  };
}

module.exports = { getUsername, getSpeakableName, rankUser, alertUser, actorOf, findUserDeep, resetActors };
