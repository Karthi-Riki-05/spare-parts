const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/authMiddleware');
const jobService = require('../services/jobService');
const verificationService = require('../services/verificationService');
const normalizationService = require('../services/normalizationService');
const detectionService = require('../services/detectionService');
const { readExcelFromBase64 } = require('../services/excelService');
const audit = require('../services/auditService');
const db = require('../services/pgService');
const { logger } = require('../utils/logger');

const router = express.Router();

// AbortController per running verification job.
const activeJobs = new Map();

// AbortController per running normalization job (normalize/submit IIFE).
const activeNormalizationJobs = new Map();

/**
 * Common background verification logic
 */
async function startBackgroundVerification(jobId, rows, auditCtx = null, originalHeaders = null) {
  const controller = new AbortController();
  activeJobs.set(jobId, controller);
  try {
    await jobService.updateJobStatus(jobId, 'processing', { started_at: new Date() });

    // If headers weren't passed in, recover them from the job record so the
    // col_0 hide/show decision in verificationService is correct.
    if (!originalHeaders) {
      try {
        const job = await jobService.getJob(jobId);
        if (job && job.original_headers) originalHeaders = job.original_headers;
      } catch (_) { /* fall through with null */ }
    }

    // Check for existing results to skip (resumed jobs).
    const existingResults = await jobService.getJobResults(jobId);
    const finishedIndexes = new Set(existingResults.map(r => r.row_index));
    const rowsToProcess = finishedIndexes.size > 0
      ? rows.filter(r => !finishedIndexes.has(r.rowIndex))
      : rows;

    if (rowsToProcess.length === 0) {
      await jobService.updateJobStatus(jobId, 'completed');
      return;
    }

    // Running stat accumulator — flushed every 10 completed rows so Activity
    // Center reflects real numbers before the job finishes.
    const runningStats = {
      totalRows:           rows.length,
      webVerified:         0,
      emptyCells:          0,
      scoreAbove90:        0,
      score70to89:         0,
      scoreBelow70:        0,
      officialSourceFound: 0,
      externalSourceFound: 0,
      notFound:            0,
    };

    try { await jobService.updateJobStats(jobId, runningStats); }
    catch (err) { logger.warn(`[JOB] Initial stats seed failed for ${jobId}: ${err.message}`); }

    // Primary check: AbortController.signal.aborted — synchronous, no DB.
    // DB fallback every 10 rows for resilience if the process restarts.
    let abortCheckCount = 0;
    const shouldAbort = async () => {
      if (controller.signal.aborted) return true;
      abortCheckCount++;
      if (abortCheckCount % 10 !== 0) return false;
      return await jobService.isJobCancelled(jobId);
    };

    await verificationService.processRows(rowsToProcess, {
      correlationId: `job-${jobId}`,
      originalHeaders,
      shouldAbort,
      signal: controller.signal,
      onRowComplete: (result) => {
        const score = result?.verificationScore || 0;
        const srcRaw = result?.sourceType || 'unknown';
        if (score > 0) runningStats.webVerified++;
        if (score >= 90) runningStats.scoreAbove90++;
        else if (score >= 70) runningStats.score70to89++;
        else runningStats.scoreBelow70++;
        if (srcRaw === 'official') runningStats.officialSourceFound++;
        else if (srcRaw === 'external' || srcRaw === 'distributor') runningStats.externalSourceFound++;
        else if (srcRaw === 'not_found') runningStats.notFound++;
        runningStats.emptyCells += [result?.description, result?.manufacturer, result?.itemNumber, result?.websiteId]
          .filter(f => !f || String(f).trim() === '').length;
      },
      onProgress: async (p) => {
        const totalDone = finishedIndexes.size + p.completed;
        await jobService.updateJobStatus(jobId, 'processing', {
          processed_rows: totalDone,
          current_phase: 'verifying'
        });
        if (p.completed % 10 === 0) {
          try { await jobService.updateJobStats(jobId, runningStats); }
          catch (err) { logger.warn(`[JOB] Mid-job stats flush failed for ${jobId}: ${err.message}`); }
        }
      },
      onComplete: async (summary) => {
        // Persist whatever rows were processed (partial or full)
        try {
          await jobService.saveJobResults(jobId, summary.results, summary.stats);
        } catch (saveErr) {
          logger.error(`[JOB] saveJobResults failed for ${jobId}: ${saveErr.message}`);
        }

        if (summary.wasCancelled) {
          await jobService.updateJobStatus(jobId, 'cancelled', {
            processed_rows: finishedIndexes.size + summary.results.length,
            current_phase: 'cancelled',
          });
          logger.info(`[JOB] Job ${jobId} cancelled after ${summary.results.length} rows`);
          return;
        }

        // Always mark completed — even if saveJobResults had a partial failure
        await jobService.updateJobStatus(jobId, 'completed', {
          processed_rows: rows.length,
          current_phase: 'complete'
        });
        logger.info(`[JOB] Job ${jobId} completed successfully (${summary.cacheHits || 0} cache hits)`);

        if (auditCtx) {
          audit.log('job_completed', {
            companyId: auditCtx.companyId,
            details: { jobId, totalRows: rows.length, cacheHits: summary.cacheHits, stats: summary.stats },
          }).catch(() => {});
        }

        try {
          const job = await jobService.getJob(jobId);
          if (job) {
            const { sendJobCompletionEmail } = require('../services/emailService');
            await sendJobCompletionEmail(job, summary.stats);
            logger.info(`[JOB] Email sent → ${job.user_email}`);
          }
        } catch (emailErr) {
          logger.error(`[JOB] Email failed: ${emailErr.message}`);
        }
      },
      onError: (err) => {
        logger.error(`[JOB] Job ${jobId} row error: ${err.message}`);
      }
    });
  } catch (err) {
    logger.error(`[JOB] Job ${jobId} failed: ${err.message}`);
    await jobService.updateJobStatus(jobId, 'failed', {
      error_message: err.message,
      current_phase: 'failed'
    });

    if (auditCtx) {
      await audit.log('job_failed', {
        companyId: auditCtx.companyId,
        details: { jobId, error: err.message, rowsProcessed: rows.length },
      });
    }

    try {
      const job = await jobService.getJob(jobId);
      if (job) {
        const { sendErrorEmail } = require('../services/emailService');
        await sendErrorEmail(job, err.message);
      }
    } catch (emailErr) {
      logger.error(`[JOB] Error email failed: ${emailErr.message}`);
    }
  } finally {
    activeJobs.delete(jobId);
  }
}

/**
 * POST /api/jobs/submit
 */
router.post('/submit', requireAuth, async (req, res) => {
  try {
    const { rows, fileName, originalHeaders } = req.body;
    const companyId = req.user.companyId;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array required' });
    }
    if (!fileName) {
      return res.status(400).json({ error: 'fileName required' });
    }

    const jobId = uuidv4();
    const created = await jobService.createJob(jobId, companyId, fileName, rows.length, 'verify', null, originalHeaders || null);

    if (!created) {
      return res.status(500).json({ error: 'Failed to create job' });
    }

    await audit.log('job_started', {
      companyId,
      details: { jobId, fileName, totalRows: rows.length, type: 'verify' },
      ...audit.reqMeta(req),
    });
    logger.info(`[JOB] Job ${jobId} submitted by company ${companyId}`);

    res.json({
      success: true,
      jobId,
      message: `Job submitted. ${rows.length} rows queued for verification.`,
    });

    startBackgroundVerification(jobId, rows, { companyId }, originalHeaders || null);
  } catch (err) {
    logger.error(`[JOB] Submit error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:jobId/status
 */
router.get('/:jobId/status', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobService.getJob(jobId);

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.company_id !== req.user.companyId) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Safety net: auto-complete jobs that processed all rows but status is still 'processing'.
    // This catches the race where late onProgress callbacks overwrote 'completed' back to 'processing'.
    // Skip for cancelled jobs.
    if (job.status === 'processing'
        && job.total_rows > 0
        && job.processed_rows >= job.total_rows
        && !job.cancelled) {
      // Check if results actually exist in DB
      const resultCount = await db.getOne(
        "SELECT COUNT(*)::int as cnt FROM job_results WHERE job_id = $1 AND row_type = 'verified'",
        [jobId]
      );
      if (resultCount && resultCount.cnt >= job.total_rows) {
        logger.warn(`[JOB STATUS] All ${job.total_rows} rows verified but status still processing — auto-completing ${jobId}`);
        await jobService.updateJobStatus(jobId, 'completed', {
          processed_rows: job.total_rows,
          current_phase: 'complete'
        });
        const refreshed = await jobService.getJob(jobId);
        if (refreshed) Object.assign(job, refreshed);
      }
    }

    const rawStats = await jobService.getJobStats(jobId);

    const stats = rawStats ? {
      ...rawStats,
      totalRows:           rawStats.total_rows        || 0,
      webVerified:         rawStats.web_verified      || 0,
      emptyCells:          rawStats.empty_cells       || 0,
      scoreAbove90:        rawStats.score_90_100      || 0,
      score70to89:         rawStats.score_70_89       || 0,
      scoreBelow70:        rawStats.score_below_70    || 0,
      officialSourceFound: rawStats.official_source   || 0,
      externalSourceFound: rawStats.external_source   || 0,
      notFound:            rawStats.not_found         || 0,
    } : null;

    let previewRows = null;
    if (job.status === 'awaiting_review' && job.results_json) {
      try {
        const parsed = job.results_json; // JSONB → already parsed
        const rows = parsed.rows || parsed;
        previewRows = Array.isArray(rows) ? rows.slice(0, 20) : null;
      } catch { previewRows = null; }
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        jobType: job.job_type || 'verify',
        currentPhase: job.current_phase || null,
        fileName: job.file_name,
        totalRows: job.total_rows,
        processedRows: job.processed_rows,
        progress: job.total_rows > 0 ? Math.round((job.processed_rows / job.total_rows) * 100) : 0,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        errorMessage: job.error_message,
        excelDownloaded: !!job.excel_downloaded,
        excelDownloadedAt: job.excel_downloaded_at || null,
      },
      stats,
      previewRows,
      originalHeaders: job.original_headers || null,
    });
  } catch (err) {
    logger.error(`[JOB] Status error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:jobId/results
 */
router.get('/:jobId/results', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobService.getJob(jobId);

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.company_id !== req.user.companyId) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!['completed', 'awaiting_review', 'cancelled'].includes(job.status)) {
      return res.status(400).json({ error: `Job not completed yet (status: ${job.status})` });
    }

    const results = await jobService.getJobResults(jobId);
    let finalResults;
    let dataType = 'empty';

    if (results && results.length > 0) {
      dataType = 'verified';
      finalResults = results.map(r => ({
        rowIndex: r.row_index,
        internalItemNumber: r.internal_item_number,
        description: r.description,
        manufacturer: r.manufacturer,
        itemNumber: r.item_number,
        typeDesignation: r.type_designation,
        supplementary: r.supplementary,
        verifiedSource: r.verified_source,
        verificationScore: r.verification_score,
        websiteId: r.website_id,
        sourceType: r.source_type,
        manufacturerWebsite: r.manufacturer_website,
        manufacturerInferred: r.manufacturer_inferred === 1,
        supplementaryUsed: r.supplementary_used === 1,
        supplementaryChanged: r.supplementary_changed === 1,
        supplementaryOriginal: r.supplementary_original,
        supplementaryType: r.supplementary_type,
        urlValidationStatus: r.url_validation_status,
        originalFields: r.original_fields || null,
        svFields: r.sv_fields || null,
      }));
    } else if (job.results_json) {
      try {
        const parsed = job.results_json; // JSONB → already parsed
        finalResults = parsed.rows || parsed;
        if (Array.isArray(finalResults) && finalResults.length > 0) {
          dataType = 'normalized';
        }
      } catch (e) {
        finalResults = [];
      }
    } else {
      finalResults = [];
    }

    const rawStats = await jobService.getJobStats(jobId);
    const stats = rawStats ? {
      ...rawStats,
      totalRows:           rawStats.total_rows        || 0,
      webVerified:         rawStats.web_verified      || 0,
      emptyCells:          rawStats.empty_cells       || 0,
      scoreAbove90:        rawStats.score_90_100      || 0,
      score70to89:         rawStats.score_70_89       || 0,
      scoreBelow70:        rawStats.score_below_70    || 0,
      officialSourceFound: rawStats.official_source   || 0,
      externalSourceFound: rawStats.external_source   || 0,
      notFound:            rawStats.not_found         || 0,
    } : null;

    res.json({
      success: true,
      results: finalResults,
      stats,
      dataType,
      originalHeaders: job.original_headers || null,
    });
  } catch (err) {
    logger.error(`[JOB] Results error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const jobs = await jobService.getJobsByCompany(companyId);

    res.json({
      success: true,
      jobs: jobs.map(j => ({
        id: j.id,
        fileName: j.file_name,
        status: j.status,
        jobType: j.job_type || 'verify',
        currentPhase: j.current_phase || null,
        totalRows: j.total_rows,
        processedRows: j.processed_rows,
        progress: j.total_rows > 0 ? Math.round((j.processed_rows / j.total_rows) * 100) : 0,
        createdAt: j.created_at,
        startedAt: j.started_at,
        completedAt: j.completed_at,
        errorMessage: j.error_message || null,
      })),
    });
  } catch (err) {
    logger.error(`[JOB] List error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/normalize/submit
 */
router.post('/normalize/submit', requireAuth, async (req, res) => {
  try {
    const { fileData, sheetIndex, format, mapping, fileName } = req.body;
    const companyId = req.user.companyId;

    if (!fileData) return res.status(400).json({ error: 'fileData required' });

    const jobId = uuidv4();
    await jobService.createJob(
      jobId, companyId, fileName || 'unnamed', 0, 'normalize',
      { sheetIndex, format, mapping }
    );
    await audit.log('file_uploaded', {
      companyId,
      details: { jobId, fileName, type: 'normalize', format },
      ...audit.reqMeta(req),
    });

    res.json({ success: true, jobId, message: 'Normalization job submitted.' });

    (async () => {
      const normController = new AbortController();
      activeNormalizationJobs.set(jobId, normController);
      try {
        await jobService.updateJobStatus(jobId, 'processing', { started_at: new Date() });
        const { rows, originalHeaders } = await readExcelFromBase64(fileData, sheetIndex);

        // Store original headers from the Excel file
        if (originalHeaders) {
          await db.execute(
            'UPDATE verification_jobs SET original_headers = $2 WHERE job_id = $1',
            [jobId, JSON.stringify(originalHeaders)]
          );
        }

        await jobService.updateJobStatus(jobId, 'processing', {
          total_rows: rows.length,
          current_phase: 'formatting'
        });

        const normalized = await normalizationService.processNormalization(rows, {
          format,
          mapping,
          correlationId: `job-norm-${jobId}`,
          signal: normController.signal,
          onProgress: async (p) => {
            await jobService.updateJobStatus(jobId, 'processing', {
              processed_rows: p.completed,
              current_phase: 'formatting'
            });
          }
        });

        await jobService.saveJobResultData(jobId, { rows: normalized, rowCount: normalized.length });

        logger.info(`[JOB] Normalization job ${jobId} finished. ${normalized.length} rows ready for review.`);
        await jobService.updateJobStatus(jobId, 'awaiting_review', {
          processed_rows: normalized.length,
          total_rows: normalized.length,
          current_phase: 'formatting'
        });
      } catch (err) {
        if (err.__cancelled) {
          const partial = err.partial || [];
          if (partial.length > 0) {
            await jobService.saveJobResultData(jobId, { rows: partial, rowCount: partial.length });
          }
          await jobService.updateJobStatus(jobId, 'cancelled', {
            processed_rows: partial.length,
            current_phase: 'cancelled'
          });
          logger.info(`[JOB] Normalize ${jobId} cancelled after ${partial.length} rows`);
        } else {
          logger.error(`[JOB] Normalize ${jobId} failed: ${err.message}`);
          await jobService.updateJobStatus(jobId, 'failed', {
            error_message: err.message,
            current_phase: 'failed'
          });
        }
      } finally {
        activeNormalizationJobs.delete(jobId);
      }
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/:jobId/start-search
 */
router.post('/:jobId/start-search', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobService.getJob(jobId);

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.company_id !== req.user.companyId) return res.status(404).json({ error: 'Job not found' });

    if (job.status !== 'awaiting_review' && job.status !== 'completed') {
      return res.status(400).json({ error: `Job is in state ${job.status}, cannot start search.` });
    }

    if (!job.results_json) {
      return res.status(400).json({ error: 'No normalized data found for this job.' });
    }

    const parsed = job.results_json; // JSONB → already parsed
    if (parsed.truncated) {
      return res.status(400).json({
        error: `This job's normalized data (${parsed.rowCount} rows) exceeded the preview storage limit. Please re-submit for direct verification.`,
        truncated: true,
        rowCount: parsed.rowCount,
      });
    }
    const rows = parsed.rows || parsed;

    const rowsPerMin = 15;
    const estimatedMinutes = Math.ceil(rows.length / rowsPerMin);

    res.json({
      success: true,
      jobId,
      totalRows: rows.length,
      estimatedMinutes,
      message: 'Deep verification started in background.'
    });

    await jobService.updateJobStatus(jobId, 'processing', {
      processed_rows: 0,
      total_rows: rows.length,
      current_phase: 'verifying',
      job_type: 'verify'
    });

    await audit.log('job_started', {
      companyId: req.user.companyId,
      details: { jobId, totalRows: rows.length, type: 'verify-resume' },
      ...audit.reqMeta(req),
    });
    startBackgroundVerification(jobId, rows, { companyId: req.user.companyId });
  } catch (err) {
    logger.error(`[JOB] Start search error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/detect/submit
 */
router.post('/detect/submit', requireAuth, async (req, res) => {
  try {
    const { fileData, sheetIndex, fileName } = req.body;
    const companyId = req.user.companyId;

    if (!fileData) return res.status(400).json({ error: 'fileData required' });

    const jobId = uuidv4();
    await jobService.createJob(jobId, companyId, fileName || 'unnamed', 1, 'detect', { sheetIndex });

    res.json({ success: true, jobId, message: 'Detection job submitted.' });

    (async () => {
      try {
        await jobService.updateJobStatus(jobId, 'processing', { started_at: new Date() });
        const result = await detectionService.processDetection(fileData, sheetIndex, {
          correlationId: `job-det-${jobId}`
        });

        await jobService.saveJobResultData(jobId, result);
        await jobService.updateJobStatus(jobId, 'completed', { processed_rows: 1 });
      } catch (err) {
        logger.error(`[JOB] Detect ${jobId} failed: ${err.message}`);
        await jobService.updateJobStatus(jobId, 'failed', { error_message: err.message });
      }
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/:jobId/cancel
 */
router.post('/:jobId/cancel', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobService.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.company_id !== req.user.companyId) return res.status(404).json({ error: 'Job not found' });
    if (!['processing', 'pending'].includes(job.status)) {
      return res.status(400).json({ error: `Job is ${job.status} — only processing or pending jobs can be cancelled` });
    }
    await jobService.cancelJob(jobId);

    const normCtrl = activeNormalizationJobs.get(jobId);
    const verifyCtrl = activeJobs.get(jobId);

    if (normCtrl) {
      normCtrl.abort();
      logger.info(`[Cancel] Job ${jobId} — normalization AbortController fired`);
    }
    if (verifyCtrl) {
      verifyCtrl.abort();
      logger.info(`[Cancel] Job ${jobId} — verification AbortController fired`);
    }
    if (!normCtrl && !verifyCtrl) {
      logger.info(`[Cancel] Job ${jobId} — no active controller (job may have just ended)`);
    }

    res.json({ success: true, message: 'Cancellation requested. Job will stop within a few seconds.' });
  } catch (err) {
    logger.error(`[JOB] Cancel error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/jobs/completed/all
 */
router.delete('/completed/all', requireAuth, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const jobs = await jobService.getJobsByCompany(companyId);
    const completed = jobs.filter(j => j.status === 'completed' || j.status === 'failed');
    let deleted = 0;
    for (const job of completed) {
      if (await jobService.deleteJob(job.id)) deleted++;
    }
    logger.info(`[JOB] Cleared ${deleted} completed jobs for company ${companyId}`);
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/jobs/:jobId
 */
router.delete('/:jobId', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobService.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.company_id !== req.user.companyId) return res.status(404).json({ error: 'Job not found' });

    const deleted = await jobService.deleteJob(jobId);
    res.json({ success: deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Initialize resume logic — called once at startup.
 * Attempts to resume any verification jobs that were in-flight when the
 * process last exited, skipping rows that are already verified.
 * Jobs whose input rows are not recoverable are marked 'failed'.
 */
async function initResumption() {
  const { getResumableJobs } = require('../services/jobResumptionService');
  let resumable;
  try {
    resumable = await getResumableJobs();
  } catch (err) {
    logger.error(`[RESUME] getResumableJobs failed: ${err.message}`);
    return;
  }

  if (resumable.length === 0) return;
  logger.info(`[RESUME] Resuming ${resumable.length} job(s) with concurrency limit 5`);

  // Simple batched concurrency — avoids pulling in p-limit ESM package here.
  for (let i = 0; i < resumable.length; i += 5) {
    const batch = resumable.slice(i, i + 5);
    await Promise.allSettled(
      batch.map(async ({ jobId, rows, originalHeaders }) => {
        logger.info(`[RESUME] Resuming job ${jobId} (${rows.length} total rows)`);
        try {
          await startBackgroundVerification(jobId, rows, null, originalHeaders);
        } catch (err) {
          logger.error(`[RESUME] Job ${jobId} resumption error: ${err.message}`);
        }
      })
    );
  }
}

module.exports = { router, initResumption };
