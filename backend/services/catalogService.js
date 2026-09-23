// backend/services/catalogService.js
const store = require('../data/store');

function ensureGiftRegistered(giftId, { name, coins, icon }) {
  const catalog = store.loadCatalog();
  if (catalog[giftId]) return catalog;

  catalog[giftId] = { name, coins, icon };
  store.saveCatalog(catalog);
  return catalog;
}

module.exports = { ensureGiftRegistered };