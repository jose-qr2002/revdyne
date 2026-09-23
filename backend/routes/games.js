const express = require('express');
const store = require('../data/store');

module.exports = function gamesRoutes() {
  const router = express.Router();
  router.get('/', (req, res) => res.json(store.loadGames()));
  return router;
};