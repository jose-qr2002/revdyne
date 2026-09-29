const express = require('express');
const store = require('../data/store');
const actionDispatcher = require('../services/actionDispatcher');
const actionQueue = require('../services/actionQueue');

const MAX_TEST_DELAY_MS = 30000;
const pending = new Map(); // testId -> timer

function findAction(actionId) {
  const profiles = store.loadProfiles();
  for (const profile of Object.values(profiles.list)) {
    if (profile.actions?.[actionId]) return profile.actions[actionId];
  }
  return null;
}

function runTest(action) {
  const settings = store.loadSettings();
  // Se prueba aunque esté desactivada
  return actionDispatcher.dispatch(
    { ...action, enabled: true },
    { times: 1, defaultDelayMs: settings.keyDelayMs || 80 }
  );
}

module.exports = function actionsRoutes() {
  const router = express.Router();

  router.post('/test', (req, res) => {
    const { actionId } = req.body;
    const delayMs = Math.min(Math.max(parseInt(req.body.delayMs, 10) || 0, 0), MAX_TEST_DELAY_MS);

    const action = findAction(actionId);
    if (!action) return res.status(404).json({ error: 'La acción no existe' });

    const simulated = action.type === 'keyboard' && !actionQueue.isRobotAvailable();

    if (delayMs === 0) {
      const result = runTest(action);
      return res.json({ ok: result.executed, simulated });
    }

    const testId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timer = setTimeout(() => {
      pending.delete(testId);
      try { runTest(action); }
      catch (e) { console.error('🔥 [TEST] Error ejecutando la prueba:', e.message); }
    }, delayMs);
    pending.set(testId, timer);

    res.json({ ok: true, scheduled: true, testId, simulated });
  });

  router.delete('/test/:testId', (req, res) => {
    const timer = pending.get(req.params.testId);
    if (timer) { clearTimeout(timer); pending.delete(req.params.testId); }
    res.json({ ok: true, cancelled: !!timer });
  });

  return router;
};