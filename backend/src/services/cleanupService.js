const db = require('./pgService');
const { logger } = require('../utils/logger');

const BATCH_SIZE = 1000;

/**
 * Delete completed/failed jobs older than daysToKeep days, in batches of 1000
 * to avoid long table locks. job_results rows are removed via ON DELETE CASCADE.
 *
 * Returns { deletedJobs } count.
 */
async function cleanupOldJobs(daysToKeep = 90) {
  let totalDeletedJobs = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Fetch a batch of eligible job IDs (avoid full-table lock by fetching first).
    const rows = await db.getMany(
      `SELECT job_id FROM verification_jobs
        WHERE created_at < NOW() - ($1 || ' days')::interval
          AND status IN ('completed', 'failed')
        LIMIT $2`,
      [daysToKeep, BATCH_SIZE]
    );

    if (rows.length === 0) break;

    const ids = rows.map(r => r.job_id);
    const result = await db.execute(
      `DELETE FROM verification_jobs WHERE job_id = ANY($1::uuid[])`,
      [ids]
    );
    totalDeletedJobs += result.rowCount;

    logger.info(`[CLEANUP] Deleted batch of ${result.rowCount} jobs (total so far: ${totalDeletedJobs})`);

    if (rows.length < BATCH_SIZE) break; // Last (partial) batch
  }

  if (totalDeletedJobs > 0) {
    logger.info(`[CLEANUP] Finished: deleted ${totalDeletedJobs} jobs older than ${daysToKeep} days`);
  }

  return { deletedJobs: totalDeletedJobs };
}

module.exports = { cleanupOldJobs };
