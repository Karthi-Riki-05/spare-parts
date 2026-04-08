const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { getStats } = require('../services/cacheService');

router.get('/', requireAuth, (req, res) => {
  try {
    const stats = getStats();
    res.json({
      success: true,
      l1Cache: {
        keys:   stats.keys    || 0,
        hits:   stats.l1Hits  || 0,
        misses: stats.misses  || 0,
      },
      l2SqliteCache: stats.sqlite || {},
      combined: {
        totalHits: (stats.hits || 0) + (stats.sqlite && stats.sqlite.totalHits ? stats.sqlite.totalHits : 0),
        estimatedCostSaved: (stats.sqlite && stats.sqlite.estimatedCostSaved) || '$0',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
