const express = require('express');
const router = express.Router();
const cacheService = require('../services/cacheService');

router.delete('/cache', (_req, res) => {
  cacheService.flush();
  res.json({ success: true, message: 'Cache cleared' });
});

router.get('/cache/stats', (_req, res) => {
  res.json(cacheService.getStats());
});

module.exports = router;
