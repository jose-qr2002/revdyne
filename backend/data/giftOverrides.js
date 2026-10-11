// backend/data/giftOverrides.js
// Aplica al catálogo las decisiones de backend/data/giftOverrides.json (IDs que son otro regalo y grupos confirmados como el mismo).
// Solo rellena lo que el catálogo aún no tiene: si el usuario eligió algo en el detalle del regalo (split true/false), eso manda.
const overrides = require('./giftOverrides.json');

const SPLIT = new Set(Object.keys(overrides.split || {}));
const SAME = new Set((overrides.same || []).flat().map(String));

// Modifica `catalog` (copia mutable) y devuelve si cambió algo
function applyOverrides(catalog) {
  let changed = false;
  for (const [id, gift] of Object.entries(catalog || {})) {
    if (!gift || typeof gift !== 'object') continue;
    if (SPLIT.has(id) && gift.split === undefined) { gift.split = true; changed = true; }
    if (SAME.has(id) && gift.same === undefined) { gift.same = true; changed = true; }
  }
  return changed;
}

module.exports = { applyOverrides };
