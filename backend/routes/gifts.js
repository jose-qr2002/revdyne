// backend/routes/gifts.js
const express = require('express');
const store = require('../data/store');

module.exports = function giftsRoutes() {
  const router = express.Router();

  router.put('/:giftId', (req, res) => {
    const { giftId } = req.params;
    const { key, modifier, sound, delay, enabled } = req.body;

    const profiles = store.loadProfiles();
    const profile = profiles.list[profiles.activeProfileId];
    if (!profile) return res.status(400).json({ error: 'No hay perfil activo' });

    if (!profile.actions) profile.actions = {};
    if (!profile.events) profile.events = [];

    // Reutiliza el evento de este regalo si ya existe, para no crear acciones huérfanas
    let evt = profile.events.find(e => e.trigger === 'gift' && e.condition === giftId);
    let actionId = evt?.actionId || `act_gift_${giftId}_${Date.now()}`;

    const macroKey = modifier && modifier !== 'none' ? `{${modifier}+${key}}` : `{${key}}`;

    profile.actions[actionId] = {
      name: `Regalo ${giftId}`,
      type: 'keyboard',
      enabled: enabled !== false,
      key: macroKey,
      sound: sound || null,
      delay: delay !== undefined ? delay : 80,
      soundEveryKey: false
    };

    if (evt) {
      evt.enabled = enabled !== false;
    } else {
      profile.events.push({
        id: `evt_gift_${giftId}_${Date.now()}`,
        trigger: 'gift',
        condition: giftId,
        actionId,
        enabled: enabled !== false
      });
    }

    store.saveProfiles(profiles);
    res.json({ ok: true, actionId });
  });

  router.delete('/:giftId', (req, res) => {
    const { giftId } = req.params;
    const profiles = store.loadProfiles();
    const profile = profiles.list[profiles.activeProfileId];
    if (!profile) return res.status(400).json({ error: 'No hay perfil activo' });

    profile.events = (profile.events || []).filter(e => !(e.trigger === 'gift' && e.condition === giftId));
    store.saveProfiles(profiles);
    res.json({ ok: true });
  });

  return router;
};