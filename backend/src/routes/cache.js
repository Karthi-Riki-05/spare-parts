const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const cacheService = require('../services/cacheService');

router.delete('/cache', requireAuth, (_req, res) => {
  cacheService.flush();
  res.json({ success: true, message: 'Cache cleared' });
});

router.get('/cache/stats', requireAuth, (_req, res) => {
  res.json(cacheService.getStats());
});

module.exports = router;
