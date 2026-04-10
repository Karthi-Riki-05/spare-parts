const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');

const dbPath = path.join(__dirname, '../../data/jobs.db');
let db = null;

function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  const db = getDb();
  
  // Verification jobs table (now a generic jobs table)
  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_jobs (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      file_name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      job_type TEXT DEFAULT 'verify',
      meta_json TEXT,
      results_json TEXT,
      total_rows INTEGER DEFAULT 0,
      processed_rows INTEGER DEFAULT 0,
      current_phase TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      error_message TEXT
    )
  `);
  
  // Migration for existing databases
  try {
    db.prepare("ALTER TABLE verification_jobs ADD COLUMN job_type TEXT DEFAULT 'verify'").run();
    db.prepare("ALTER TABLE verification_jobs ADD COLUMN meta_json TEXT").run();
    db.prepare("ALTER TABLE verification_jobs ADD COLUMN results_json TEXT").run();
    db.prepare("ALTER TABLE verification_jobs ADD COLUMN current_phase TEXT").run();
  } catch (e) {
    // Columns already exist, ignore
  }
  
  // Job results table
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      row_index INTEGER,
      internal_item_number TEXT,
      description TEXT,
      manufacturer TEXT,
      item_number TEXT,
      type_designation TEXT,
      supplementary TEXT,
      verified_source TEXT,
      verification_score INTEGER,
      website_id TEXT,
      source_type TEXT,
      manufacturer_website TEXT,
      manufacturer_inferred BOOLEAN,
      supplementary_used BOOLEAN,
      supplementary_changed BOOLEAN,
      supplementary_original TEXT,
      supplementary_type TEXT,
      url_validation_status TEXT,
      FOREIGN KEY (job_id) REFERENCES verification_jobs(id)
    )
  `);
  
  // Job stats summary table
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_stats (
      job_id TEXT PRIMARY KEY,
      total_rows INTEGER,
      web_verified INTEGER,
      empty_cells INTEGER,
      score_above_90 INTEGER,
      score_50_to_89 INTEGER,
      score_below_50 INTEGER,
      official_source INTEGER,
      external_source INTEGER,
      not_found INTEGER,
      FOREIGN KEY (job_id) REFERENCES verification_jobs(id)
    )
  `);
}

/**
 * Create a new job
 */
function createJob(jobId, userEmail, fileName, totalRows, type = 'verify', meta = null) {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO verification_jobs (id, user_email, file_name, total_rows, status, job_type, meta_json)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(jobId, userEmail, fileName, totalRows, type, meta ? JSON.stringify(meta) : null);
    logger.info(`[JOB] Created ${type} job ${jobId} for ${userEmail} | file: ${fileName} | rows: ${totalRows}`);
    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to create job ${jobId}: ${err.message}`);
    return false;
  }
}

/**
 * Get job by ID
 */
function getJob(jobId) {
  const db = getDb();
  try {
    const job = db.prepare('SELECT * FROM verification_jobs WHERE id = ?').get(jobId);
    if (job) {
      if (job.meta_json) job.meta = JSON.parse(job.meta_json);
      if (job.results_json) job.resultsData = JSON.parse(job.results_json);
    }
    return job;
  } catch (err) {
    logger.error(`[JOB] Failed to get job ${jobId}: ${err.message}`);
    return null;
  }
}

/**
 * Get all jobs for a user
 */
function getJobsByUser(userEmail, limit = 50) {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT * FROM verification_jobs 
      WHERE user_email = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(userEmail, limit);
  } catch (err) {
    logger.error(`[JOB] Failed to get jobs for ${userEmail}: ${err.message}`);
    return [];
  }
}

/**
 * Update job status
 */
function updateJobStatus(jobId, status, progressData = {}) {
  const db = getDb();
  try {
    const updates = ['status = ?'];
    const values = [status];
    
    if (status === 'processing' && !progressData.started_at) {
      updates.push('started_at = CURRENT_TIMESTAMP');
    } else if (progressData.started_at) {
      updates.push('started_at = ?');
      values.push(progressData.started_at instanceof Date ? progressData.started_at.toISOString() : progressData.started_at);
    }
    if (status === 'completed' || status === 'failed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }
    if (progressData.processed_rows !== undefined) {
      updates.push('processed_rows = ?');
      values.push(progressData.processed_rows);
    }
    if (progressData.error_message !== undefined) {
      updates.push('error_message = ?');
      values.push(progressData.error_message);
    }
    if (progressData.current_phase !== undefined) {
      updates.push('current_phase = ?');
      values.push(progressData.current_phase);
    }
    if (progressData.total_rows !== undefined) {
      updates.push('total_rows = ?');
      values.push(progressData.total_rows);
    }
    if (progressData.job_type !== undefined) {
      updates.push('job_type = ?');
      values.push(progressData.job_type);
    }

    values.push(jobId);
    db.prepare(`UPDATE verification_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    logger.info(`[JOB] Updated job ${jobId} status to ${status}`);
    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to update job ${jobId}: ${err.message}`);
    return false;
  }
}

/**
 * Save verification results for a job
 */
function saveJobResults(jobId, results, stats) {
  const db = getDb();
  try {
    const stmt = db.prepare(`
      INSERT INTO job_results (
        job_id, row_index, internal_item_number, description, manufacturer,
        item_number, type_designation, supplementary, verified_source,
        verification_score, website_id, source_type, manufacturer_website,
        manufacturer_inferred, supplementary_used, supplementary_changed,
        supplementary_original, supplementary_type, url_validation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const transaction = db.transaction(() => {
      for (const row of results) {
        stmt.run(
          jobId,
          row.rowIndex,
          row.internalItemNumber,
          row.description,
          row.manufacturer,
          row.itemNumber,
          row.typeDesignation,
          row.supplementary,
          row.verifiedSource,
          row.verificationScore,
          row.websiteId,
          row.sourceType,
          row.manufacturerWebsite,
          row.manufacturerInferred ? 1 : 0,
          row.supplementaryUsed ? 1 : 0,
          row.supplementaryChanged ? 1 : 0,
          row.supplementaryOriginal,
          row.supplementaryType,
          row.urlValidationStatus
        );
      }
      
      // Save stats
      if (stats) {
        db.prepare(`
          INSERT INTO job_stats (
            job_id, total_rows, web_verified, empty_cells, score_above_90,
            score_50_to_89, score_below_50, official_source, external_source, not_found
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          jobId,
          stats.totalRows,
          stats.webVerified,
          stats.emptyCells,
          stats.scoreAbove90,
          stats.score50to89,
          stats.scoreBelow50,
          stats.officialSourceFound,
          stats.externalSourceFound,
          stats.notFound
        );
      }
    });
    
    transaction();
    logger.info(`[JOB] Saved ${results.length} results for job ${jobId}`);
    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to save results for job ${jobId}: ${err.message}`);
    return false;
  }
}

/**
 * Get job results
 */
function getJobResults(jobId) {
  const db = getDb();
  try {
    return db.prepare('SELECT * FROM job_results WHERE job_id = ? ORDER BY row_index').all(jobId);
  } catch (err) {
    logger.error(`[JOB] Failed to get results for job ${jobId}: ${err.message}`);
    return [];
  }
}

/**
 * Get job stats
 */
function getJobStats(jobId) {
  const db = getDb();
  try {
    return db.prepare('SELECT * FROM job_stats WHERE job_id = ?').get(jobId);
  } catch (err) {
    logger.error(`[JOB] Failed to get stats for job ${jobId}: ${err.message}`);
    return null;
  }
}

/**
 * Save generic result data (JSON) for a job (e.g. for Detect/Normalize phases)
 */
function saveJobResultData(jobId, resultsData) {
  const db = getDb();
  try {
    db.prepare('UPDATE verification_jobs SET results_json = ? WHERE id = ?')
      .run(JSON.stringify(resultsData), jobId);
    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to save result data for job ${jobId}: ${err.message}`);
    return false;
  }
}

/**
 * Delete a job and its associated files
 */
function deleteJob(jobId) {
  const db = getDb();
  try {
    const job = getJob(jobId);
    if (!job) return false;

    db.transaction(() => {
      db.prepare('DELETE FROM job_stats WHERE job_id = ?').run(jobId);
      db.prepare('DELETE FROM job_results WHERE job_id = ?').run(jobId);
      db.prepare('DELETE FROM verification_jobs WHERE id = ?').run(jobId);
    })();

    // Delete exported file if it exists
    const exportPath = path.join(__dirname, '../../data/exports', `${jobId}.xlsx`);
    if (fs.existsSync(exportPath)) {
      fs.unlinkSync(exportPath);
    }

    return true;
  } catch (err) {
    logger.error(`[JOB] Failed to delete job ${jobId}: ${err.message}`);
    return false;
  }
}

/**
 * Find and resume jobs that were processing when the server stopped
 */
function resumeJobs(workerCallback) {
  const db = getDb();
  try {
    const jobs = db.prepare("SELECT * FROM verification_jobs WHERE status = 'processing' AND job_type = 'verify'").all();
    if (jobs.length > 0) {
      logger.info(`[JOB] Found ${jobs.length} interrupted jobs. Resuming...`);
      for (const job of jobs) {
        // Mark as pending first to let the regular submission logic pick it up
        updateJobStatus(job.id, 'pending', { error_message: 'Resumed after server restart' });
        
        // Trigger worker callback (calling routes/jobs logic ideally)
        if (workerCallback) workerCallback(job);
      }
    }
  } catch (err) {
    logger.error(`[JOB] Resume error: ${err.message}`);
  }
}

/**
 * Cleanup jobs and files older than specified hours
 */
function cleanupOldJobs(hours = 48) {
  const db = getDb();
  try {
    const threshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const oldJobs = db.prepare("SELECT id FROM verification_jobs WHERE created_at < ? AND status IN ('completed', 'failed')").all(threshold);
    
    if (oldJobs.length > 0) {
      logger.info(`[JOB] Cleaning up ${oldJobs.length} old jobs...`);
      for (const job of oldJobs) {
        deleteJob(job.id);
      }
    }
  } catch (err) {
    logger.error(`[JOB] Cleanup error: ${err.message}`);
  }
}

module.exports = {
  getDb,
  initSchema,
  createJob,
  getJob,
  getJobsByUser,
  updateJobStatus,
  saveJobResults,
  getJobResults,
  getJobStats,
  saveJobResultData,
  deleteJob,
  resumeJobs,
  cleanupOldJobs,
};
