// backend/services/tiktok/frequency.js
// Frecuencia de una regla por usuario: siempre, una vez por directo o con enfriamiento. La usan los eventos que se repiten mucho (compartir,
// entrar al directo, comentarios, Super Fan). Cada regla puede traer su `frequency`; si no, se usa el modo por defecto del disparador.

const onceSeen = new Set();          // "reglaId_usuario" ya ejecutados (modo "una vez")
const cooldowns = new Map();         // "reglaId_usuario" -> último disparo (modo "enfriamiento")
const MAX_ENTRIES = 10000;

function passes(evt, userKey, defaultMode = 'once') {
  const mode = evt.frequency || defaultMode;
  if (mode === 'always') return true;

  const key = `${evt.id}_${userKey}`;

  if (mode === 'once') {
    if (onceSeen.has(key)) return false;
    onceSeen.add(key);
    if (onceSeen.size > MAX_ENTRIES * 3) onceSeen.delete(onceSeen.values().next().value);
    return true;
  }

  if (mode === 'cooldown') {
    const last = cooldowns.get(key);
    if (last && Date.now() - last < (evt.cooldownSeconds || 0) * 1000) return false;
    cooldowns.set(key, Date.now());
    if (cooldowns.size > MAX_ENTRIES) cooldowns.delete(cooldowns.keys().next().value);
    return true;
  }

  return true;
}

// Al conectar: "una vez" y los enfriamientos empiezan de cero en cada directo
function reset() {
  onceSeen.clear();
  cooldowns.clear();
}

module.exports = { passes, reset };
