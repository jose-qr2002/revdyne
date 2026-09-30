// backend/services/eventEngine.js
const store = require('../data/store');
const entitlements = require('./entitlements');

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

function collect(profile, allowed, predicate) {
  return (profile.events || [])
    .filter(evt => evt.enabled && allowed.events.has(evt.id) && allowed.actions.has(evt.actionId) && predicate(evt))
    .map(evt => ({ evt, actions: profile.actions || {} }));
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

module.exports = { findMatchingEvents, getEventsByTrigger };