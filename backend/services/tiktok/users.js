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

module.exports = { getUsername, getSpeakableName, rankUser, alertUser };
