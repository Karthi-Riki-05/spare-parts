const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const cacheService = require('../services/cacheService');

router.delete('/cache', requireAuth, async (_req, res) => {
  await cacheService.flush();
  res.json({ success: true, message: 'Cache cleared' });
});

router.get('/cache/stats', requireAuth, async (_req, res) => {
  res.json(await cacheService.getStats());
});

module.exports = router;
