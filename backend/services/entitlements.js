const license = require('./license');

// Único lugar donde se definen los límites. null = sin límite.
const TIERS = {
  free: { maxActions: 5, maxEvents: 5, maxStickerBindings: 3, ttsEngines: ['browser'] },
  pro:  { maxActions: null, maxEvents: null, maxStickerBindings: null, ttsEngines: null }
};

const getLimits = () => TIERS[license.getTier()] || TIERS.free;

function countUsage(profiles) {
  let actions = 0, events = 0, stickers = 0;
  for (const p of Object.values(profiles?.list || {})) {
    actions += Object.keys(p.actions || {}).length;
    for (const evt of p.events || []) (evt.trigger === 'sticker' ? stickers++ : events++);
  }
  return { actions, events, stickers };
}

// Qué acciones y eventos cuentan dentro del límite (los primeros en orden de creación)
function allowedIds(profiles) {
  const L = getLimits();
  const actions = new Set(), events = new Set();
  let a = 0, e = 0, s = 0;
  for (const p of Object.values(profiles?.list || {})) {
    for (const id of Object.keys(p.actions || {})) {
      if (L.maxActions === null || a < L.maxActions) { actions.add(id); a++; }
    }
    for (const evt of p.events || []) {
      if (evt.trigger === 'sticker') {
        if (L.maxStickerBindings === null || s < L.maxStickerBindings) { events.add(evt.id); s++; }
      } else if (L.maxEvents === null || e < L.maxEvents) { events.add(evt.id); e++; }
    }
  }
  return { actions, events };
}

const LABELS = {
  actions: ['maxActions', 'acciones'],
  events: ['maxEvents', 'eventos'],
  stickers: ['maxStickerBindings', 'stickers asignados']
};

// Rechaza solo si el guardado AUMENTA el uso por encima del límite: borrar o editar siempre se permite
function validateProfilesSave(oldProfiles, newProfiles) {
  if (!newProfiles || typeof newProfiles.list !== 'object') return { ok: false, error: 'Datos de perfiles inválidos.' };
  const L = getLimits(), before = countUsage(oldProfiles), after = countUsage(newProfiles);
  for (const [key, [limitKey, label]] of Object.entries(LABELS)) {
    const max = L[limitKey];
    if (max !== null && after[key] > max && after[key] > before[key]) {
      return { ok: false, error: `El plan gratuito permite hasta ${max} ${label}. Activa un código para quitar el límite.` };
    }
  }
  return { ok: true };
}

const canUseTtsEngine = (engine) => { const list = getLimits().ttsEngines; return list === null || list.includes(engine); };

const requireTtsEngine = (engine) => (_req, res, next) =>
  canUseTtsEngine(engine)
    ? next()
    : res.status(403).json({ code: 'LICENSE_REQUIRED', error: `El motor "${engine}" requiere un código de licencia.` });

module.exports = { getLimits, countUsage, allowedIds, validateProfilesSave, canUseTtsEngine, requireTtsEngine };