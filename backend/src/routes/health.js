const { Router } = require('express');
const { config } = require('../config');
const cacheService = require('../services/cacheService');
const geminiPool = require('../services/geminiPool');
const db = require('../services/pgService');
const { formatTimestamp, getTimezoneAbbr } = require('../utils/timeUtils');

const router = Router();
const startTime = Date.now();

function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  return `${hours}h ${mins}m`;
}

router.get('/health', async (_req, res) => {
  try {
    const cacheStats = await cacheService.getStats();
    const jobCounts = { active: 0, queued: 0, completed: 0, failed: 0 };

    try {
      const rows = await db.getMany(
        'SELECT status, COUNT(*)::int AS c FROM verification_jobs GROUP BY status'
      );
      for (const row of rows) {
        if (row.status === 'processing') jobCounts.active = row.c;
        else if (row.status === 'pending') jobCounts.queued = row.c;
        else if (row.status === 'completed') jobCounts.completed = row.c;
        else if (row.status === 'failed') jobCounts.failed = row.c;
      }
    } catch {}

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: formatUptime(Date.now() - startTime),
      auth: 'enabled',
      cache: {
        l1Keys: cacheStats.keys,
        l2Rows: cacheStats.pg ? cacheStats.pg.totalCached : 0,
        dbSizeKb: cacheStats.pg ? cacheStats.pg.dbSizeKb : 0,
        hitRate: cacheStats.hitRate + '%',
      },
      jobs: jobCounts,
      gemini: {
        keysConfigured: geminiPool.getKeyCount(),
        model: 'gemini-2.5-flash',
        mockMode: config.geminiMockMode,
      },
      timezone: config.appTimezone,
      timezoneAbbr: getTimezoneAbbr(),
      serverTime: formatTimestamp(new Date()),
    });
  } catch (err) {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
  }
});

module.exports = router;
