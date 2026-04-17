const { readExcelFromBase64 } = require('./excelService');
const { detectFormat } = require('./openaiService');
const { validateSparePartsContent } = require('./validationService');
const { detectLanguage } = require('./languageService');
const { logger } = require('../utils/logger');

async function processDetection(fileData, sheetIndex = 0, options = {}) {
  const { correlationId = 'internal' } = options;

  const { rows, originalHeaders } = await readExcelFromBase64(fileData, sheetIndex);
  if (rows.length === 0) {
    throw new Error('No data found in sheet');
  }

  const sampleRows = rows.slice(0, 10);
  logger.info('Detection starting', { correlationId, totalRows: rows.length });

  // Step 1: Validate this is actually spare parts data (fast, cheap)
  const validation = await validateSparePartsContent(sampleRows);
  if (!validation.valid) {
    const err = new Error('This file does not appear to contain spare parts data.');
    err.status = 422;
    err.details = {
      error: 'invalid_file_content',
      message: err.message,
      detectedType: validation.detectedType,
      reason: validation.reason,
      suggestion: 'Please upload an Excel file containing spare part descriptions, manufacturer names, and item/part numbers.',
    };
    throw err;
  }

  // Step 2: Detect language (fast, cheap — runs parallel with format detection)
  const [formatResult, langResult] = await Promise.all([
    detectFormat(sampleRows.slice(0, 5), correlationId),
    detectLanguage(sampleRows).catch(() => ({ language: 'English', languageCode: 'en', translationNeeded: false, detectedWords: [] })),
  ]);

  return {
    ...formatResult,
    rowCount: rows.length,
    sheetIndex,
    originalHeaders: originalHeaders || null,
    detectedLanguage: langResult.language,
    languageCode: langResult.languageCode,
    translationNeeded: langResult.translationNeeded,
  };
}

module.exports = {
  processDetection
};
