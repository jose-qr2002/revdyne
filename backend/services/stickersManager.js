// backend/services/stickersManager.js
const store = require('../data/store');

// ---- Catálogo de stickers (solo id -> nombre/ícono) ----

function getCatalog() {
  const stickers = store.loadStickers();
  return stickers.catalog || {};
}

function upsertCatalogEntry(stickerId, { name, icon }) {
  const stickers = store.loadStickers();
  stickers.catalog[stickerId] = { name, icon };
  store.saveStickers(stickers);
  return stickers.catalog;
}

function removeFromCatalog(stickerId) {
  const stickers = store.loadStickers();
  if (!stickers.catalog[stickerId]) return false;

  delete stickers.catalog[stickerId];
  store.saveStickers(stickers);

  // Evita eventos huérfanos apuntando a un sticker que ya no existe
  removeAllAssignments(stickerId);
  return true;
}

// ---- Asignaciones sticker -> acción (ahora viven como eventos en profiles.json) ----

function findEvent(profile, stickerId) {
  return (profile.events || []).find(
    (e) => e.trigger === 'sticker' && e.condition === stickerId
  );
}

function assign(profileId, stickerId, actionId, enabled = true) {
  const profiles = store.loadProfiles();
  const profile = profiles.list[profileId];
  if (!profile) throw new Error(`El perfil "${profileId}" no existe`);

  if (!profile.events) profile.events = [];

  const existing = findEvent(profile, stickerId);
  if (existing) {
    existing.actionId = actionId;
    existing.enabled = enabled;
  } else {
    profile.events.push({
      id: `evt_${Date.now()}`,
      trigger: 'sticker',
      condition: stickerId,
      actionId,
      enabled,
    });
  }

  store.saveProfiles(profiles);
  return profile.events;
}

function unassign(profileId, stickerId) {
  const profiles = store.loadProfiles();
  const profile = profiles.list[profileId];
  if (!profile) return false;

  const before = (profile.events || []).length;
  profile.events = (profile.events || []).filter(
    (e) => !(e.trigger === 'sticker' && e.condition === stickerId)
  );
  store.saveProfiles(profiles);
  return profile.events.length !== before;
}

function removeAllAssignments(stickerId) {
  const profiles = store.loadProfiles();
  let changed = false;

  Object.values(profiles.list).forEach((profile) => {
    const before = (profile.events || []).length;
    profile.events = (profile.events || []).filter(
      (e) => !(e.trigger === 'sticker' && e.condition === stickerId)
    );
    if (profile.events.length !== before) changed = true;
  });

  if (changed) store.saveProfiles(profiles);
}

// Lo que está "activo ahora": global + perfil de juego seleccionado
function getActiveAssignments() {
  const profiles = store.loadProfiles();
  const globalEvents = profiles.list.prof_global?.events || [];
  const activeEvents = profiles.list[profiles.activeProfileId]?.events || [];

  return [...globalEvents, ...activeEvents].filter((e) => e.trigger === 'sticker');
}

module.exports = {
  getCatalog,
  upsertCatalogEntry,
  removeFromCatalog,
  assign,
  unassign,
  getActiveAssignments,
};