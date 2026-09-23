// backend/routes/catalog.js
const express = require('express');
const store = require('../data/store');

module.exports = function catalogRoutes() {
  const router = express.Router();

  router.post('/sync', async (req, res) => {
    try {
      const response = await fetch('https://webcast.tiktok.com/webcast/gift/list/?aid=1988', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' }
      });
      if (!response.ok) throw new Error('Error de conexión con TikTok');
      const json = await response.json();
      const gifts = json.data?.gifts || [];
      if (gifts.length === 0) throw new Error('TikTok no devolvió regalos');

      const catalog = store.loadCatalog();
      let nuevos = 0, actualizados = 0;

      gifts.forEach(gift => {
        const giftId = String(gift.id);
        const iconUrl = gift.image?.url_list?.[0] || gift.icon?.url_list?.[0] || '';
        if (!catalog[giftId]) nuevos++; else actualizados++;
        catalog[giftId] = { name: gift.name, coins: gift.diamond_count || 0, icon: iconUrl };
      });

      store.saveCatalog(catalog);
      res.json({ success: true, nuevos, actualizados, total: Object.keys(catalog).length, catalog });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/', (req, res) => res.json(store.loadCatalog()));

  return router;
};