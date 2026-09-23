// backend/routes/system.js
const express = require('express');

module.exports = function systemRoutes() {
  const router = express.Router();

  router.post('/restart', (req, res) => {
    res.json({ success: true });
    setTimeout(() => {
      try {
        const { app: electronApp } = require('electron');
        electronApp.relaunch();
        electronApp.exit(0);
      } catch (e) {
        process.exit(0);
      }
    }, 500);
  });

  return router;
};