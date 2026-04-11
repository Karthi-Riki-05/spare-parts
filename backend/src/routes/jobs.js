const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/authMiddleware');
const jobService = require('../services/jobService');
const verificationService = require('../services/verificationService');
const normalizationService = require('../services/normalizationService');
const detectionService = require('../services/detectionService');
const { readExcelFromBase64 } = require('../services/excelService');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * Common background verification logic
 */
async function startBackgroundVerification(jobId, rows) {
  try {
    // If resuming, rows might be empty or partial. We need to fetch all rows
    // but skip ones already in job_results.
    // For now, we assume rows are passed in.

    jobService.updateJobStatus(jobId, 'processing', { started_at: new Date() });

    // Check for existing results to skip
    const existingResults = jobService.getJobResults(jobId);
    const finishedIndexes = new Set(existingResults.map(r => r.row_index));
    const rowsToProcess = finishedIndexes.size > 0
      ? rows.filter(r => !finishedIndexes.has(r.rowIndex))
      : rows;

    if (rowsToProcess.length === 0) {
      jobService.updateJobStatus(jobId, 'completed');
      return;
    }

    // Running stat accumulator — flushed to SQLite every 10 completed rows so
    // ActivityCenter reflects real numbers before the job finishes, and so the
    // row exists in job_stats even if final saveJobResults never runs (crash).
    const runningStats = {
      totalRows:           rows.length,
      webVerified:         0,
      emptyCells:          0,
      scoreAbove90:        0,
      score50to89:         0,
      scoreBelow50:        0,
      officialSourceFound: 0,
      externalSourceFound: 0,
      notFound:            0,
    };

    // Seed the row immediately so getJobStats never returns null mid-job.
    try { jobService.updateJobStats(jobId, runningStats); }
    catch (err) { logger.warn(`[JOB] Initial stats seed failed for ${jobId}: ${err.message}`); }

    await verificationService.processRows(rowsToProcess, {
      correlationId: `job-${jobId}`,
      onRowComplete: (result) => {
        const score = result?.verificationScore || 0;
        const srcRaw = result?.sourceType || 'unknown';
        if (score > 0) runningStats.webVerified++;
        if (score >= 90) runningStats.scoreAbove90++;
        else if (score >= 50) runningStats.score50to89++;
        else runningStats.scoreBelow50++;
        if (srcRaw === 'official') runningStats.officialSourceFound++;
        else if (srcRaw === 'external' || srcRaw === 'distributor') runningStats.externalSourceFound++;
        else if (srcRaw === 'not_found') runningStats.notFound++;
        runningStats.emptyCells += [result?.description, result?.manufacturer, result?.itemNumber, result?.websiteId]
          .filter(f => !f || String(f).trim() === '').length;
      },
      onProgress: (p) => {
        const totalDone = finishedIndexes.size + p.completed;
        jobService.updateJobStatus(jobId, 'processing', {
          processed_rows: totalDone,
          current_phase: 'verifying'
        });
        // Flush stats every 10 rows to keep Activity Center live without thrashing SQLite.
        if (p.completed % 10 === 0) {
          try { jobService.updateJobStats(jobId, runningStats); }
          catch (err) { logger.warn(`[JOB] Mid-job stats flush failed for ${jobId}: ${err.message}`); }
        }
      },
      onComplete: async (summary) => {
        jobService.saveJobResults(jobId, summary.results, summary.stats);
        jobService.updateJobStatus(jobId, 'completed', {
          processed_rows: rows.length,
          current_phase: 'complete'
        });
        logger.info(`[JOB] Job ${jobId} completed successfully`);

        // Send email notification (non-blocking)
        try {
          const job = jobService.getJob(jobId);
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
    jobService.updateJobStatus(jobId, 'failed', { 
      error_message: err.message,
      current_phase: 'failed'
    });
  }
}

/**
 * POST /api/jobs/submit
 * Submit a verification job (for large files)
 */
router.post('/submit', requireAuth, (req, res) => {
  try {
    const { rows, fileName } = req.body;
    const userEmail = req.user.email;
    
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array required' });
    }
    if (!fileName) {
      return res.status(400).json({ error: 'fileName required' });
    }
    
    const jobId = uuidv4();
    const created = jobService.createJob(jobId, userEmail, fileName, rows.length);
    
    if (!created) {
      return res.status(500).json({ error: 'Failed to create job' });
    }
    
    logger.info(`[JOB] Job ${jobId} submitted by ${userEmail}`);
    
    
    res.json({
      success: true,
      jobId,
      message: `Job submitted. ${rows.length} rows queued for verification.`,
    });

    // Start background processing
    startBackgroundVerification(jobId, rows);
  } catch (err) {
    logger.error(`[JOB] Submit error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:jobId/status
 * Get job status and progress
 */
router.get('/:jobId/status', requireAuth, (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobService.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Verify user owns this job
    if (job.user_email !== req.user.email) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const rawStats = jobService.getJobStats(jobId);

    // Normalise to both snake_case (legacy) and camelCase (frontend types)
    // so ActivityCenter.tsx / jobs detail pages never see undefined fields.
    const stats = rawStats ? {
      ...rawStats,
      totalRows:           rawStats.total_rows        || 0,
      webVerified:         rawStats.web_verified      || 0,
      emptyCells:          rawStats.empty_cells       || 0,
      scoreAbove90:        rawStats.score_above_90    || 0,
      score50to89:         rawStats.score_50_to_89    || 0,
      scoreBelow50:        rawStats.score_below_50    || 0,
      officialSourceFound: rawStats.official_source   || 0,
      externalSourceFound: rawStats.external_source   || 0,
      notFound:            rawStats.not_found         || 0,
    } : null;

    // Include preview rows for awaiting_review jobs
    let previewRows = null;
    if (job.status === 'awaiting_review' && job.results_json) {
      try {
        const parsed = JSON.parse(job.results_json);
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
    });
  } catch (err) {
    logger.error(`[JOB] Status error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:jobId/results
 * Get verification results for a completed job
 */
router.get('/:jobId/results', requireAuth, (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobService.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Verify user owns this job
    if (job.user_email !== req.user.email) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    if (job.status !== 'completed' && job.status !== 'awaiting_review') {
      return res.status(400).json({ error: `Job not completed yet (status: ${job.status})` });
    }
    
    const results = jobService.getJobResults(jobId);
    let finalResults;
    // dataType lets the frontend branch unambiguously:
    //   'verified'   → job_results has row-indexed verified cells (background verify completed)
    //   'normalized' → only results_json has normalized rows (awaiting review / normalize-only job)
    //   'empty'      → neither
    let dataType = 'empty';

    if (results && results.length > 0) {
      dataType = 'verified';
      // Convert back to camelCase for frontend
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
      }));
    } else if (job.results_json) {
      // For normalization / detect jobs that save to results_json
      try {
        finalResults = JSON.parse(job.results_json).rows || JSON.parse(job.results_json);
        if (Array.isArray(finalResults) && finalResults.length > 0) {
          dataType = 'normalized';
        }
      } catch (e) {
        finalResults = [];
      }
    } else {
      finalResults = [];
    }

    // Normalise job_stats row to BOTH snake_case (legacy) and camelCase (frontend).
    // Previously only /:jobId/status did this — /:jobId/results returned raw snake_case,
    // which was the root cause of the empty stats bar after background completion.
    const rawStats = jobService.getJobStats(jobId);
    const stats = rawStats ? {
      ...rawStats,
      totalRows:           rawStats.total_rows        || 0,
      webVerified:         rawStats.web_verified      || 0,
      emptyCells:          rawStats.empty_cells       || 0,
      scoreAbove90:        rawStats.score_above_90    || 0,
      score50to89:         rawStats.score_50_to_89    || 0,
      scoreBelow50:        rawStats.score_below_50    || 0,
      officialSourceFound: rawStats.official_source   || 0,
      externalSourceFound: rawStats.external_source   || 0,
      notFound:            rawStats.not_found         || 0,
    } : null;

    res.json({
      success: true,
      results: finalResults,
      stats,
      dataType,
    });
  } catch (err) {
    logger.error(`[JOB] Results error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs
 * Get all jobs for the current user
 */
router.get('/', requireAuth, (req, res) => {
  try {
    const userEmail = req.user.email;
    const jobs = jobService.getJobsByUser(userEmail);
    
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
 * Submit a normalization job
 */
router.post('/normalize/submit', requireAuth, (req, res) => {
  try {
    const { fileData, sheetIndex, format, mapping, fileName } = req.body;
    const userEmail = req.user.email;
    
    if (!fileData) return res.status(400).json({ error: 'fileData required' });
    
    const jobId = uuidv4();
    // We don't know the row count yet without reading, 0 is fine
    jobService.createJob(jobId, userEmail, fileName || 'unnamed', 0, 'normalize', { sheetIndex, format, mapping });
    
    res.json({ success: true, jobId, message: 'Normalization job submitted.' });

    // Background process
    (async () => {
      try {
        jobService.updateJobStatus(jobId, 'processing', { started_at: new Date() });
        const { rows } = await readExcelFromBase64(fileData, sheetIndex);
        
        jobService.updateJobStatus(jobId, 'processing', { 
          total_rows: rows.length,
          current_phase: 'formatting'
        });

        const normalized = await normalizationService.processNormalization(rows, {
          format,
          mapping,
          correlationId: `job-norm-${jobId}`,
          onProgress: (p) => {
            jobService.updateJobStatus(jobId, 'processing', { 
              processed_rows: p.completed,
              current_phase: 'formatting'
            });
          }
        });

        jobService.saveJobResultData(jobId, { rows: normalized, rowCount: normalized.length });

        // Stop at formatting - wait for user review before verification
        logger.info(`[JOB] Normalization job ${jobId} finished. ${normalized.length} rows ready for review.`);
        jobService.updateJobStatus(jobId, 'awaiting_review', {
          processed_rows: normalized.length,
          total_rows: normalized.length,
          current_phase: 'formatting'
        });
      } catch (err) {
        logger.error(`[JOB] Normalize ${jobId} failed: ${err.message}`);
        jobService.updateJobStatus(jobId, 'failed', { 
          error_message: err.message,
          current_phase: 'failed'
        });
      }
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/:jobId/start-search
 * Transition from awaiting_review to actual verification (search phase)
 */
router.post('/:jobId/start-search', requireAuth, (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobService.getJob(jobId);
    
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.user_email !== req.user.email) return res.status(403).json({ error: 'Unauthorized' });
    
    if (job.status !== 'awaiting_review' && job.status !== 'completed') {
      return res.status(400).json({ error: `Job is in state ${job.status}, cannot start search.` });
    }

    if (!job.results_json) {
      return res.status(400).json({ error: 'No normalized data found for this job.' });
    }

    const parsed = JSON.parse(job.results_json);
    const rows = parsed.rows || parsed;

    const rowsPerMin = 15; // rough estimate
    const estimatedMinutes = Math.ceil(rows.length / rowsPerMin);

    res.json({
      success: true,
      jobId,
      totalRows: rows.length,
      estimatedMinutes,
      message: 'Deep verification started in background.'
    });

    // Start verification phase — update job_type to 'verify' so results load correctly
    jobService.updateJobStatus(jobId, 'processing', {
      processed_rows: 0,
      total_rows: rows.length,
      current_phase: 'verifying',
      job_type: 'verify'
    });
    
    // Start verification
    startBackgroundVerification(jobId, rows);
  } catch (err) {
    logger.error(`[JOB] Start search error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/detect/submit
 * Submit a format detection job
 */
router.post('/detect/submit', requireAuth, (req, res) => {
  try {
    const { fileData, sheetIndex, fileName } = req.body;
    const userEmail = req.user.email;
    
    if (!fileData) return res.status(400).json({ error: 'fileData required' });
    
    const jobId = uuidv4();
    jobService.createJob(jobId, userEmail, fileName || 'unnamed', 1, 'detect', { sheetIndex });
    
    res.json({ success: true, jobId, message: 'Detection job submitted.' });

    // Background process
    (async () => {
      try {
        jobService.updateJobStatus(jobId, 'processing', { started_at: new Date() });
        const result = await detectionService.processDetection(fileData, sheetIndex, {
          correlationId: `job-det-${jobId}`
        });
        
        jobService.saveJobResultData(jobId, result);
        jobService.updateJobStatus(jobId, 'completed', { processed_rows: 1 });
      } catch (err) {
        logger.error(`[JOB] Detect ${jobId} failed: ${err.message}`);
        jobService.updateJobStatus(jobId, 'failed', { error_message: err.message });
      }
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/jobs/completed/all
 * Clear all completed jobs for current user
 */
router.delete('/completed/all', requireAuth, (req, res) => {
  try {
    const userEmail = req.user.email;
    const jobs = jobService.getJobsByUser(userEmail);
    const completed = jobs.filter(j => j.status === 'completed' || j.status === 'failed');
    let deleted = 0;
    for (const job of completed) {
      if (jobService.deleteJob(job.id)) deleted++;
    }
    logger.info(`[JOB] Cleared ${deleted} completed jobs for ${userEmail}`);
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/jobs/:jobId
 * Clear/Delete a job
 */
router.delete('/:jobId', requireAuth, (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobService.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.user_email !== req.user.email) return res.status(403).json({ error: 'Unauthorized' });

    const deleted = jobService.deleteJob(jobId);
    res.json({ success: deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Initialize resume logic
 */
function initResumption() {
  jobService.resumeJobs((job) => {
    // For resumption to work effectively, we'd need the original 'rows' 
    // which are currently NOT stored in the SQLite DB (only results are).
    // In a production app, we'd store the input JSON. 
    // For now, we'll mark resumed jobs as failed if they don't have results 
    // or just leave them as 'pending' for manual restart if needed.
    // IMPROVEMENT: We will log that manual restart is required or 
    // it will be picked up if rows are found.
    logger.warn(`[JOB] Resumption of ${job.id} requires row data. Marking as failed for re-submit.`);
    jobService.updateJobStatus(job.id, 'failed', { error_message: 'Job interrupted by server restart. Please re-submit.' });
  });
}

module.exports = { router, initResumption };
