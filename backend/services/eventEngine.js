// backend/services/eventEngine.js
const store = require('../data/store');

function getActiveEventSources() {
  const profiles = store.loadProfiles();
  const global = profiles.list.prof_global || { actions: {}, events: [] };
  const active = profiles.list[profiles.activeProfileId] || { actions: {}, events: [] };
  return { global, active };
}

// Para gift/follow/share/sticker: busca coincidencia exacta de condition
function findMatchingEvents(triggerType, conditionValue) {
  const { global, active } = getActiveEventSources();
  const condStr = String(conditionValue);

  const matchesIn = (profile) => (profile.events || [])
    .filter(evt => evt.enabled && evt.trigger === triggerType &&
      (evt.condition === 'any' || String(evt.condition) === condStr))
    .map(evt => ({ evt, actions: profile.actions || {} }));

  return [...matchesIn(global), ...matchesIn(active)];
}

// Para like: necesita TODOS los eventos del trigger (la comparación de umbral la hace el caller)
function getEventsByTrigger(triggerType) {
  const { global, active } = getActiveEventSources();

  const collect = (profile) => (profile.events || [])
    .filter(evt => evt.enabled && evt.trigger === triggerType)
    .map(evt => ({ evt, actions: profile.actions || {} }));

  return [...collect(global), ...collect(active)];
}

module.exports = { findMatchingEvents, getEventsByTrigger };