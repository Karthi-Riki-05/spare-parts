const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { getStats } = require('../services/cacheService');

router.get('/', requireAuth, async (req, res) => {
  try {
    const stats = await getStats();
    // Keep the legacy `l2SqliteCache` key for frontend compatibility even though
    // storage is now Postgres. Rename can happen alongside the P4 UI refresh.
    res.json({
      success: true,
      l1Cache: {
        keys:   stats.keys    || 0,
        hits:   stats.l1Hits  || 0,
        misses: stats.misses  || 0,
      },
      l2SqliteCache: stats.pg || {},
      combined: {
        totalHits: (stats.hits || 0) + (stats.pg && stats.pg.totalHits ? stats.pg.totalHits : 0),
        estimatedCostSaved: (stats.pg && stats.pg.estimatedCostSaved) || '$0',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
