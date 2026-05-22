const jobService = require('./jobService');
const { logger } = require('../utils/logger');

/**
 * Scan for verification_jobs stuck in 'processing' after a restart and classify
 * them as either resumable or not.
 *
 * Resumable: job.results_json contains untruncated row data (normalize→verify flow).
 * Not resumable: direct-submit jobs whose input rows were in-memory only.
 *
 * Returns an array of { jobId, rows, originalHeaders } for jobs that can be
 * resumed. Non-resumable jobs are marked 'failed' before returning.
 *
 * Callers (initResumption in routes/jobs.js) pass each entry to
 * startBackgroundVerification, which internally skips already-verified rows.
 */
async function getResumableJobs() {
  const db = require('./pgService');

  const interruptedJobs = await db.getMany(
    `SELECT job_id, total_rows, processed_rows, results_json, original_headers, status
       FROM verification_jobs
      WHERE status = 'processing' AND job_type = 'verify'`
  );

  if (interruptedJobs.length === 0) return [];
  logger.info(`[RESUME] Found ${interruptedJobs.length} interrupted job(s)`);

  const resumable = [];

  for (const job of interruptedJobs) {
    const jobId = job.job_id;

    // Case 1: all rows already verified (e.g., crash happened right before
    // the status update). Auto-complete without re-processing.
    const verifiedCount = await db.getOne(
      `SELECT COUNT(*)::int AS cnt FROM job_results
        WHERE job_id = $1 AND row_type = 'verified'`,
      [jobId]
    );
    if (verifiedCount && verifiedCount.cnt >= job.total_rows && job.total_rows > 0) {
      logger.info(`[RESUME] Job ${jobId} — all rows verified, auto-completing`);
      await jobService.updateJobStatus(jobId, 'completed', {
        processed_rows: job.total_rows,
        current_phase: 'complete',
      });
      continue;
    }

    // Case 2: results_json has full row data → resume from it.
    const parsed = job.results_json;
    if (parsed && !parsed.truncated) {
      const rows = parsed.rows || parsed;
      if (Array.isArray(rows) && rows.length > 0) {
        logger.info(`[RESUME] Job ${jobId} — resumable via results_json (${rows.length} total rows, ${verifiedCount?.cnt || 0} already done)`);
        resumable.push({
          jobId,
          rows,
          originalHeaders: job.original_headers || null,
        });
        continue;
      }
    }

    // Case 3: no input data available (direct-submit job, rows were in-memory).
    logger.warn(`[RESUME] Job ${jobId} — no input data available, marking failed`);
    await jobService.updateJobStatus(jobId, 'failed', {
      error_message: 'Job interrupted by server restart. Input rows were not persisted — please re-submit.',
      current_phase: 'failed',
    });
  }

  return resumable;
}

module.exports = { getResumableJobs };
