// backend/services/eventEngine.js
const store = require('../data/store');
const entitlements = require('./entitlements');
const actionDispatcher = require('./actionDispatcher');
const { isSoundOnly } = require('./actionSteps');

function getActiveEventSources() {
  const profiles = store.loadProfiles();
  const global = profiles.list.prof_global || { actions: {}, events: [] };
  const activeId = profiles.activeProfileId;

  // Si el perfil global YA es el activo, no lo devolvemos dos veces
  const active = (activeId && activeId !== 'prof_global')
    ? (profiles.list[activeId] || { actions: {}, events: [] })
    : null;

  return { global, active, allowed: entitlements.allowedIds(profiles) };
}

// Acciones de un evento: `actionIds` se ejecutan todas a la vez; de `randomActionIds` se elige una al azar.
// Los eventos guardados antes tienen un solo `actionId` (= lista de una). Los stickers siguen usando `actionId`.
function eventActionIds(evt) {
  const all = Array.isArray(evt.actionIds) ? evt.actionIds : (evt.actionId ? [evt.actionId] : []);
  const random = Array.isArray(evt.randomActionIds) ? evt.randomActionIds : [];
  return { all, random };
}

function collect(profile, allowed, predicate) {
  // Solo las acciones dentro del límite del plan; un evento sin ninguna acción permitida no se devuelve
  const actions = Object.fromEntries(Object.entries(profile.actions || {}).filter(([id]) => allowed.actions.has(id)));
  return (profile.events || [])
    .filter(evt => {
      if (!evt.enabled || !allowed.events.has(evt.id) || !predicate(evt)) return false;
      const { all, random } = eventActionIds(evt);
      return [...all, ...random].some(id => actions[id]);
    })
    .map(evt => ({ evt, actions }));
}

// Objetos de acción del evento que existen (fijas y aleatorias), p. ej. para decidir el enfriamiento de un sticker
function eventActions(evt, actions) {
  const { all, random } = eventActionIds(evt);
  return [...all, ...random].map(id => actions[id]).filter(Boolean);
}
const eventIsSoundOnly = (evt, actions) => { const list = eventActions(evt, actions); return list.length > 0 && list.every(isSoundOnly); };

// Ejecuta las acciones de un evento. `times` = unidades (5 rosas = 5): las fijas reciben `times`; de las aleatorias se sortea una
// por unidad (5 rosas pueden disparar 5 acciones distintas) y se agrupan para que cada acción elegida se lance una vez con su cuenta.
function runEvent(evt, actions, opts = {}) {
  const times = Math.max(1, opts.times || 1);
  const labels = [];
  let executed = false;
  const run = (action, n) => {
    const result = actionDispatcher.dispatch(action, { ...opts, times: n });
    if (result.executed) { executed = true; if (result.label) labels.push(result.label); }
  };

  const { all, random } = eventActionIds(evt);
  for (const id of all) if (actions[id]) run(actions[id], times);

  const pool = random.filter(id => actions[id]?.enabled);
  if (pool.length) {
    const picks = {};
    for (let i = 0; i < times; i++) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      picks[id] = (picks[id] || 0) + 1;
    }
    for (const [id, n] of Object.entries(picks)) run(actions[id], n);
  }

  return executed ? { executed: true, label: labels.join(' + ') } : { executed: false };
}

function findMatchingEvents(triggerType, conditionValue) {
  const { global, active, allowed } = getActiveEventSources();
  const condStr = String(conditionValue);
  const predicate = evt => evt.trigger === triggerType && (evt.condition === 'any' || String(evt.condition) === condStr);

  const result = collect(global, allowed, predicate);
  if (active) result.push(...collect(active, allowed, predicate));
  return result;
}

function getEventsByTrigger(triggerType) {
  const { global, active, allowed } = getActiveEventSources();
  const predicate = evt => evt.trigger === triggerType;

  const result = collect(global, allowed, predicate);
  if (active) result.push(...collect(active, allowed, predicate));
  return result;
}

module.exports = { findMatchingEvents, getEventsByTrigger, runEvent, eventActionIds, eventActions, eventIsSoundOnly };
