const express = require('express');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/dev/simulate-crash
 * Kills the process after 1 second. Use this to test job resumption:
 *   1. Submit a large verification job.
 *   2. Call this endpoint while the job is running.
 *   3. Restart the backend.
 *   4. Check logs — the job should resume from where it left off.
 *
 * Only available when NODE_ENV !== 'production'.
 */
router.post('/simulate-crash', (_req, res) => {
  logger.warn('[DEV] simulate-crash triggered — process will exit in 1s');
  res.json({ message: 'Process will exit in 1 second. Restart backend to test job resumption.' });
  setTimeout(() => {
    logger.warn('[DEV] simulate-crash: exiting now');
    process.exit(0);
  }, 1000);
});

module.exports = router;
