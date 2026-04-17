const { buildVerifiedExcel } = require('../services/excelService');
const { translateFromEnglish } = require('../services/languageService');
const jobService = require('../services/jobService');
const audit = require('../services/auditService');
const { logger } = require('../utils/logger');

/**
 * Hydrate original-row data for the Original Data sheet.
 * Priority:
 *   1. Client-supplied originalData (inline SSE flow).
 *   2. Normalized rows persisted to verification_jobs.results_json (job flow).
 *   3. job_results table (fallback — columns without AI mutation).
 */
async function resolveOriginalData(body) {
  if (Array.isArray(body.originalData) && body.originalData.length > 0) {
    return body.originalData;
  }
  const jobId = body.jobId;
  if (!jobId) return [];

  try {
    const job = await jobService.getJob(jobId);
    if (job && job.results_json) {
      // results_json is JSONB — already an object, no JSON.parse needed.
      const parsed = job.results_json;
      const rows = parsed.rows || parsed;
      if (Array.isArray(rows) && rows.length > 0) return rows;
    }
  } catch (err) {
    logger.warn(`[EXPORT] Failed to read results_json for job ${jobId}: ${err.message}`);
  }

  try {
    const rows = await jobService.getJobResults(jobId);
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map(r => ({
        internalItemNumber: r.internal_item_number || '',
        description:        r.description || '',
        manufacturer:       r.manufacturer || '',
        itemNumber:         r.item_number || '',
        typeDesignation:    r.type_designation || '',
        supplementary:      r.supplementary || '',
      }));
    }
  } catch (err) {
    logger.warn(`[EXPORT] Failed to load job_results for ${jobId}: ${err.message}`);
  }

  return [];
}

async function handleExport(req, res, next) {
  try {
    const { results, fileName, originalFormat, language, jobId } = req.body;
    if (!Array.isArray(results)) {
      return res.status(400).json({ error: 'results array required' });
    }
    const format = originalFormat || results[0]?._originalFormat || 'A';
    const originalData = await resolveOriginalData(req.body);

    let exportResults = results;

    if (language && language !== 'en' && language !== 'English') {
      logger.info(`[EXPORT] Translating ${results.length} rows to ${language}`);
      exportResults = await Promise.all(results.map(async (row) => {
        try {
          const translatedDesc = await translateFromEnglish(
            row.description, language, row.originalDescription || null
          );
          return { ...row, description: translatedDesc };
        } catch {
          return row;
        }
      }));
    }

    const buffer = await buildVerifiedExcel(exportResults, originalData, format);
    const baseName = (fileName || 'spare_parts').replace(/\.xlsx?$/i, '');

    if (jobId) {
      // Fire-and-forget — never block the response on the stats write.
      jobService.markExcelDownloaded(jobId).catch(err =>
        logger.warn(`[EXPORT] markExcelDownloaded failed for ${jobId}: ${err.message}`)
      );
      if (req.company) {
        audit.log('excel_downloaded', {
          companyId: req.company.id,
          details: { jobId, fileName, rowCount: results.length },
          ...audit.reqMeta(req),
        });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="verified_${baseName}.xlsx"`);
    res.send(buffer);
  } catch (error) { next(error); }
}

module.exports = { handleExport };
