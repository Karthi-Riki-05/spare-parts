const path = require('path');
const fs = require('fs');
const db = require('./pgService');
const { logger } = require('../utils/logger');

/**
 * PG-backed replacement for the legacy SQLite jobService.
 *
 * Return shapes continue to use snake_case so routes/jobs.js and other callers
 * don't require a shape migration alongside the P2 data-layer swap. Only the
 * function signatures that can't be faked have changed:
 *   - createJob's 2nd arg is now companyId (UUID), not userEmail
 *   - getJobsByUser → getJobsByCompany(companyId, limit)
 *
 * Ownership checks in routes should compare job.company_id against
 * req.user.companyId (attached by the bridge requireAuth middleware).
 */

/**
 * Shape returned PG rows to match the legacy jobService contract.
 * We expose `id` as an alias for `job_id`, and if results_json is present we
 * set `resultsData` so legacy callers can access `.resultsData.rows` etc.
 */
function mapJobRow(row) {
  if (!row) return null;
  return {
    id:                    row.job_id,
    job_id:                row.job_id,
    company_id:            row.company_id,
    // user_email is preserved (via LEFT JOIN on companies.email) so email
    // templates and legacy owner-email logs keep working. Ownership checks
    // in route handlers must use company_id, not this field.
    user_email:            row.company_email || null,
    file_name:             row.file_name,
    status:                row.status,
    job_type:              row.job_type || 'verify',
    current_phase:         row.current_phase,
    total_rows:            row.total_rows,
    processed_rows:        row.processed_rows,
    started_at:            row.started_at,
    completed_at:          row.completed_at,
    created_at:            row.created_at,
    error_message:         row.error_message,
    excel_downloaded:      !!row.excel_downloaded,
    excel_downloaded_at:   row.excel_downloaded_at,
    meta:                  row.meta,
    meta_json:             row.meta ? JSON.stringify(row.meta) : null,
    results_json:          row.results_json || null,
    resultsData:           row.results_json || null,
    original_headers:      row.original_headers || null,
  };
}

const JOB_SELECT = `
  SELECT vj.*, c.email AS company_email
    FROM verification_jobs vj
    LEFT JOIN companies c ON c.id = vj.company_id
`;

async function createJob(jobId, companyId, fileName, totalRows, type = 'verify', meta = null, originalHeaders = null) {
  try {
    await db.execute(
      `INSERT INTO verification_jobs
         (job_id, company_id, file_name, total_rows, status, job_type, meta, original_headers)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)`,
      [jobId, companyId, fileName, totalRows, type, meta, originalHeaders ? JSON.stringify(originalHeaders) : null]
    );
    logger.info(`[JOB] Created ${type} job ${jobId} for company ${companyId} | file: ${fileName} | rows: ${totalRows}`);
    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to create job ${jobId}: ${err.message}`);
    return false;
  }
}

async function getJob(jobId) {
  try {
    const row = await db.getOne(`${JOB_SELECT} WHERE vj.job_id = $1`, [jobId]);
    return mapJobRow(row);
  } catch (err) {
    logger.error(`[JOB] Failed to get job ${jobId}: ${err.message}`);
    return null;
  }
}

async function getJobsByCompany(companyId, limit = 50) {
  try {
    const rows = await db.getMany(
      `${JOB_SELECT}
       WHERE vj.company_id = $1
       ORDER BY vj.created_at DESC
       LIMIT $2`,
      [companyId, limit]
    );
    return rows.map(mapJobRow);
  } catch (err) {
    logger.error(`[JOB] Failed to get jobs for company ${companyId}: ${err.message}`);
    return [];
  }
}

async function updateJobStatus(jobId, status, progressData = {}) {
  try {
    const sets = ['status = $2', 'updated_at = NOW()'];
    const values = [jobId, status];

    if (status === 'processing' && !progressData.started_at) {
      sets.push('started_at = NOW()');
    } else if (progressData.started_at) {
      sets.push(`started_at = $${values.length + 1}`);
      values.push(
        progressData.started_at instanceof Date
          ? progressData.started_at.toISOString()
          : progressData.started_at
      );
    }
    if (status === 'completed' || status === 'failed') {
      sets.push('completed_at = NOW()');
    }
    if (progressData.processed_rows !== undefined) {
      sets.push(`processed_rows = $${values.length + 1}`);
      values.push(progressData.processed_rows);
    }
    if (progressData.error_message !== undefined) {
      sets.push(`error_message = $${values.length + 1}`);
      values.push(progressData.error_message);
    }
    if (progressData.current_phase !== undefined) {
      sets.push(`current_phase = $${values.length + 1}`);
      values.push(progressData.current_phase);
    }
    if (progressData.total_rows !== undefined) {
      sets.push(`total_rows = $${values.length + 1}`);
      values.push(progressData.total_rows);
    }
    if (progressData.job_type !== undefined) {
      sets.push(`job_type = $${values.length + 1}`);
      values.push(progressData.job_type);
    }

    // Guard: never downgrade from a terminal state back to processing.
    // Includes 'cancelled' so a late onProgress callback cannot resurrect a cancelled job.
    const terminalGuard = (status === 'processing')
      ? ` AND status NOT IN ('completed', 'failed', 'cancelled')`
      : '';

    const result = await db.execute(
      `UPDATE verification_jobs SET ${sets.join(', ')} WHERE job_id = $1${terminalGuard}`,
      values
    );
    if (result.rowCount > 0) {
      logger.info(`[JOB] Updated job ${jobId} status to ${status}`);
    }
    return result.rowCount > 0;
  } catch (err) {
    logger.error(`[JOB] Failed to update job ${jobId}: ${err.message}`);
    return false;
  }
}

async function saveJobResults(jobId, results, stats) {
  try {
    await db.withTransaction(async (client) => {
      // Insert one row per verified row; ON CONFLICT so repeated completes on
      // resume don't break the whole transaction.
      for (const row of results) {
        // Extract and strip _originalFields/_svFields before storing row_data (keeps JSONB clean)
        const originalFields = row._originalFields || null;
        const svFields = row._svFields || null;
        const { _originalFields: _drop1, _svFields: _drop2, ...rowData } = row;
        await client.query(
          `INSERT INTO job_results (job_id, row_index, row_data, original_row_data, row_data_sv, row_type)
           VALUES ($1, $2, $3, $4, $5, 'verified')
           ON CONFLICT (job_id, row_index, row_type) DO UPDATE SET
             row_data = EXCLUDED.row_data,
             original_row_data = COALESCE(EXCLUDED.original_row_data, job_results.original_row_data),
             row_data_sv = COALESCE(EXCLUDED.row_data_sv, job_results.row_data_sv)`,
          [jobId, row.rowIndex, rowData, originalFields, svFields]
        );
      }
      if (stats) {
        await client.query(
          `UPDATE verification_jobs SET
             total_rows     = $2,
             web_verified   = $3,
             empty_cells    = $4,
             score_90_100   = $5,
             score_70_89    = $6,
             score_below_70 = $7,
             official_source= $8,
             external_source= $9,
             not_found      = $10,
             updated_at     = NOW()
           WHERE job_id = $1`,
          [
            jobId,
            stats.totalRows || 0,
            stats.webVerified || 0,
            stats.emptyCells || 0,
            stats.scoreAbove90 || 0,
            stats.score70to89 || 0,
            stats.scoreBelow70 || 0,
            stats.officialSourceFound || 0,
            stats.externalSourceFound || 0,
            stats.notFound || 0,
          ]
        );
      }
    });
    logger.info(`[JOB] Saved ${results.length} results for job ${jobId}`);
    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to save results for job ${jobId}: ${err.message}`);
    return false;
  }
}

/**
 * Returns legacy snake_case result rows. row_data JSONB is camelCase (the
 * shape produced by verificationService), so we flatten it to snake_case here
 * to match the contract route handlers expect.
 */
async function getJobResults(jobId) {
  try {
    const rows = await db.getMany(
      `SELECT row_index, row_data, original_row_data, row_data_sv FROM job_results
       WHERE job_id = $1 AND row_type = 'verified'
       ORDER BY row_index ASC`,
      [jobId]
    );
    return rows.map(r => {
      const d = r.row_data || {};
      return {
        row_index:              r.row_index,
        internal_item_number:   d.internalItemNumber,
        description:            d.description,
        manufacturer:           d.manufacturer,
        item_number:            d.itemNumber,
        type_designation:       d.typeDesignation,
        supplementary:          d.supplementary,
        verified_source:        d.verifiedSource,
        verification_score:     d.verificationScore,
        website_id:             d.websiteId,
        source_type:            d.sourceType,
        manufacturer_website:   d.manufacturerWebsite,
        manufacturer_inferred:  d.manufacturerInferred ? 1 : 0,
        supplementary_used:     d.supplementaryUsed ? 1 : 0,
        supplementary_changed:  d.supplementaryChanged ? 1 : 0,
        supplementary_original: d.supplementaryOriginal,
        supplementary_type:     d.supplementaryType,
        url_validation_status:  d.urlValidationStatus,
        original_fields:        r.original_row_data || null,
        sv_fields:              r.row_data_sv || null,
      };
    });
  } catch (err) {
    logger.error(`[JOB] Failed to get results for job ${jobId}: ${err.message}`);
    return [];
  }
}

async function getJobStats(jobId) {
  try {
    const row = await db.getOne(
      `SELECT total_rows, web_verified, empty_cells,
              score_90_100,
              score_70_89,
              score_below_70,
              official_source,
              external_source,
              not_found
       FROM verification_jobs WHERE job_id = $1`,
      [jobId]
    );
    return row;
  } catch (err) {
    logger.error(`[JOB] Failed to get stats for job ${jobId}: ${err.message}`);
    return null;
  }
}

async function updateJobStats(jobId, stats) {
  try {
    await db.execute(
      `UPDATE verification_jobs SET
         total_rows     = $2,
         web_verified   = $3,
         empty_cells    = $4,
         score_90_100   = $5,
         score_70_89    = $6,
         score_below_70 = $7,
         official_source= $8,
         external_source= $9,
         not_found      = $10,
         updated_at     = NOW()
       WHERE job_id = $1`,
      [
        jobId,
        stats.totalRows || 0,
        stats.webVerified || 0,
        stats.emptyCells || 0,
        stats.scoreAbove90 || 0,
        stats.score70to89 || 0,
        stats.scoreBelow70 || 0,
        stats.officialSourceFound || 0,
        stats.externalSourceFound || 0,
        stats.notFound || 0,
      ]
    );
    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to update stats for job ${jobId}: ${err.message}`);
    return false;
  }
}

async function markExcelDownloaded(jobId) {
  try {
    await db.execute(
      `UPDATE verification_jobs
       SET excel_downloaded = TRUE, excel_downloaded_at = NOW(), updated_at = NOW()
       WHERE job_id = $1`,
      [jobId]
    );
    logger.info(`[JOB] Marked ${jobId} as excel_downloaded`);
    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to mark downloaded ${jobId}: ${err.message}`);
    return false;
  }
}

const MAX_RESULTS_JSON_ROWS = 5000;

async function saveJobResultData(jobId, resultsData) {
  try {
    let payload = resultsData;
    if (Array.isArray(resultsData?.rows) && resultsData.rows.length > MAX_RESULTS_JSON_ROWS) {
      payload = { truncated: true, rowCount: resultsData.rows.length };
      logger.warn(`[JOB] results_json for ${jobId} truncated (${resultsData.rows.length} rows > ${MAX_RESULTS_JSON_ROWS})`);
    }
    await db.execute(
      'UPDATE verification_jobs SET results_json = $2, updated_at = NOW() WHERE job_id = $1',
      [jobId, payload]
    );
    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to save result data for job ${jobId}: ${err.message}`);
    return false;
  }
}

async function deleteJob(jobId) {
  try {
    const existing = await db.getOne('SELECT 1 FROM verification_jobs WHERE job_id = $1', [jobId]);
    if (!existing) return false;

    // job_results has ON DELETE CASCADE on job_id, so one DELETE is enough.
    await db.execute('DELETE FROM verification_jobs WHERE job_id = $1', [jobId]);

    // Delete exported file if it exists (legacy on-disk artefact).
    const exportPath = path.join(__dirname, '../../data/exports', `${jobId}.xlsx`);
    try { if (fs.existsSync(exportPath)) fs.unlinkSync(exportPath); } catch {}

    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to delete job ${jobId}: ${err.message}`);
    return false;
  }
}

/**
 * Rowless resumption — flags any job stuck in 'processing' and hands them to
 * the worker callback. The callback marks them failed; the input rows are not
 * persisted so we can't truly resume (same behavior as pre-P2).
 */
async function resumeJobs(workerCallback) {
  try {
    const jobs = await db.getMany(
      `${JOB_SELECT} WHERE vj.status = 'processing' AND vj.job_type = 'verify'`
    );
    if (jobs.length > 0) {
      logger.info(`[JOB] Found ${jobs.length} interrupted jobs. Resuming...`);
      for (const job of jobs) {
        await updateJobStatus(job.job_id, 'pending', {
          error_message: 'Resumed after server restart',
        });
        if (workerCallback) await workerCallback(mapJobRow(job));
      }
    }
  } catch (err) {
    logger.error(`[JOB] Resume error: ${err.message}`);
  }
}

async function cancelJob(jobId) {
  try {
    await db.execute(
      'UPDATE verification_jobs SET cancelled = TRUE, updated_at = NOW() WHERE job_id = $1',
      [jobId]
    );
    logger.info(`[JOB] Cancellation flag set for ${jobId}`);
    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to set cancel flag for ${jobId}: ${err.message}`);
    return false;
  }
}

async function isJobCancelled(jobId) {
  try {
    const row = await db.getOne('SELECT cancelled FROM verification_jobs WHERE job_id = $1', [jobId]);
    return !!(row?.cancelled);
  } catch (err) {
    logger.error(`[JOB] Failed to read cancel flag for ${jobId}: ${err.message}`);
    return false;
  }
}

async function cleanupOldJobs(hours = 48) {
  try {
    const res = await db.execute(
      `DELETE FROM verification_jobs
       WHERE created_at < NOW() - ($1 || ' hours')::interval
         AND status IN ('completed', 'failed')`,
      [hours]
    );
    if (res.rowCount > 0) {
      logger.info(`[JOB] Cleaned up ${res.rowCount} old jobs`);
    }
  } catch (err) {
    logger.error(`[JOB] Cleanup error: ${err.message}`);
  }
}

module.exports = {
  createJob,
  getJob,
  getJobsByCompany,
  // legacy alias kept for any straggler — routes use getJobsByCompany
  getJobsByUser: getJobsByCompany,
  updateJobStatus,
  saveJobResults,
  getJobResults,
  getJobStats,
  updateJobStats,
  markExcelDownloaded,
  saveJobResultData,
  deleteJob,
  resumeJobs,
  cleanupOldJobs,
  cancelJob,
  isJobCancelled,
};
