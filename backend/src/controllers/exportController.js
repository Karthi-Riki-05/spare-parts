const { buildVerifiedExcel } = require('../services/excelService');
const { translateFromEnglish } = require('../services/languageService');
const { logger } = require('../utils/logger');

async function handleExport(req, res, next) {
  try {
    const { results, originalData, fileName, originalFormat, language } = req.body;
    const format = originalFormat || results[0]?._originalFormat || 'A';

    let exportResults = results;

    // If non-English language requested, translate descriptions back
    if (language && language !== 'en' && language !== 'English') {
      logger.info(`[EXPORT] Translating ${results.length} rows to ${language}`);
      exportResults = await Promise.all(results.map(async (row) => {
        try {
          const translatedDesc = await translateFromEnglish(
            row.description, language, row.originalDescription || null
          );
          return { ...row, description: translatedDesc };
        } catch {
          return row; // Graceful fallback — keep English
        }
      }));
    }

    const buffer = await buildVerifiedExcel(exportResults, originalData, format);
    const baseName = fileName.replace(/\.xlsx?$/i, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="verified_${baseName}.xlsx"`);
    res.send(buffer);
  } catch (error) { next(error); }
}

module.exports = { handleExport };
