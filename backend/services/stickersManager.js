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

function assign(profileId, stickerId, updates = {}) {
  const profiles = store.loadProfiles();
  const profile = profiles.list[profileId];
  if (!profile) throw new Error(`El perfil "${profileId}" no existe`);

  if (!profile.actions) profile.actions = {};
  if (!profile.events) profile.events = [];

  const existing = findEvent(profile, stickerId);

  const merged = {
    id: existing?.id || `evt_${Date.now()}`,
    trigger: 'sticker',
    condition: stickerId,
    actionId: updates.actionId !== undefined ? updates.actionId : existing?.actionId,
    enabled: updates.enabled !== undefined ? updates.enabled : (existing?.enabled ?? true),
    cooldownSeconds: updates.cooldownSeconds !== undefined ? updates.cooldownSeconds : (existing?.cooldownSeconds || 0),
    repeatMode: updates.repeatMode !== undefined ? updates.repeatMode : (existing?.repeatMode || 'once'),
    repeatLimit: updates.repeatLimit !== undefined ? updates.repeatLimit : (existing?.repeatLimit || 1),
    playbackStyle: updates.playbackStyle !== undefined ? updates.playbackStyle : (existing?.playbackStyle || 'sequential'), // 🌟 nuevo
  };

  if (existing) Object.assign(existing, merged);
  else profile.events.push(merged);

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

function upsertManyCatalogEntries(entries) {
  const stickers = store.loadStickers();
  let added = 0;
  entries.forEach(({ id, name, icon, category }) => {
    if (!stickers.catalog[id]) added++;
    stickers.catalog[id] = { name, icon, category };
  });
  store.saveStickers(stickers);
  return { catalog: stickers.catalog, added };
}

module.exports = {
  getCatalog,
  upsertCatalogEntry,
  removeFromCatalog,
  assign,
  unassign,
  getActiveAssignments,
  upsertManyCatalogEntries,
};