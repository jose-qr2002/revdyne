// backend/services/eventEngine.js
const store = require('../data/store');

function getActiveEventSources() {
  const profiles = store.loadProfiles();
  const global = profiles.list.prof_global || { actions: {}, events: [] };
  const activeId = profiles.activeProfileId;

  // Si el perfil global YA es el activo, no lo devolvemos dos veces
  const active = (activeId && activeId !== 'prof_global')
    ? (profiles.list[activeId] || { actions: {}, events: [] })
    : null;

  return { global, active };
}

function findMatchingEvents(triggerType, conditionValue) {
  const { global, active } = getActiveEventSources();
  const condStr = String(conditionValue);

  const matchesIn = (profile) => (profile.events || [])
    .filter(evt => evt.enabled && evt.trigger === triggerType &&
      (evt.condition === 'any' || String(evt.condition) === condStr))
    .map(evt => ({ evt, actions: profile.actions || {} }));

  const result = matchesIn(global);
  if (active) result.push(...matchesIn(active)); // solo se agrega si es un perfil distinto
  return result;
}

function getEventsByTrigger(triggerType) {
  const { global, active } = getActiveEventSources();

  const collect = (profile) => (profile.events || [])
    .filter(evt => evt.enabled && evt.trigger === triggerType)
    .map(evt => ({ evt, actions: profile.actions || {} }));

  const result = collect(global);
  if (active) result.push(...collect(active));
  return result;
}

module.exports = { findMatchingEvents, getEventsByTrigger };