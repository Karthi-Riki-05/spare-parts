const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/authMiddleware');
const jobService = require('../services/jobService');
const { logger } = require('../utils/logger');

const router = express.Router();

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
    
    const stats = jobService.getJobStats(jobId);
    
    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        fileName: job.file_name,
        totalRows: job.total_rows,
        processedRows: job.processed_rows,
        progress: job.total_rows > 0 ? Math.round((job.processed_rows / job.total_rows) * 100) : 0,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        errorMessage: job.error_message,
      },
      stats: stats || null,
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
    
    if (job.status !== 'completed') {
      return res.status(400).json({ error: `Job not completed yet (status: ${job.status})` });
    }
    
    const results = jobService.getJobResults(jobId);
    const stats = jobService.getJobStats(jobId);
    
    // Convert back to camelCase for frontend
    const formattedResults = results.map(r => ({
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
    
    res.json({
      success: true,
      results: formattedResults,
      stats: stats || null,
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
        totalRows: j.total_rows,
        processedRows: j.processed_rows,
        progress: j.total_rows > 0 ? Math.round((j.processed_rows / j.total_rows) * 100) : 0,
        createdAt: j.created_at,
        startedAt: j.started_at,
        completedAt: j.completed_at,
      })),
    });
  } catch (err) {
    logger.error(`[JOB] List error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
