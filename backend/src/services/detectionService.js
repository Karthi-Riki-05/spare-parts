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

  // Deterministic guardrail: if the data clearly matches Format B shape
  // (col_1 has long free-text and col_2..col_5 are empty across data rows),
  // override the AI verdict — headers can fool the model into picking A.
  const corrected = correctFormatByContent(sampleRows, formatResult, correlationId);

  return {
    ...corrected,
    rowCount: rows.length,
    sheetIndex,
    originalHeaders: originalHeaders || null,
    detectedLanguage: langResult.language,
    languageCode: langResult.languageCode,
    translationNeeded: langResult.translationNeeded,
  };
}

function correctFormatByContent(sampleRows, formatResult, correlationId) {
  if (!sampleRows.length) return formatResult;

  // Skip the header row if present — first row often holds labels.
  const dataRows = sampleRows.slice(1).length > 0 ? sampleRows.slice(1) : sampleRows;

  let longCol1 = 0;
  let emptyOtherCols = 0;
  for (const row of dataRows) {
    const c1 = String(row.col_1 || '').trim();
    const c2 = String(row.col_2 || '').trim();
    const c3 = String(row.col_3 || '').trim();
    const c4 = String(row.col_4 || '').trim();
    const c5 = String(row.col_5 || '').trim();
    if (c1.length >= 15) longCol1++;
    if (!c2 && !c3 && !c4 && !c5) emptyOtherCols++;
  }

  const total = dataRows.length;
  const longRatio = longCol1 / total;
  const emptyRatio = emptyOtherCols / total;

  if (longRatio >= 0.6 && emptyRatio >= 0.6 && formatResult.format !== 'B') {
    logger.warn(`[FORMAT DETECT] ${correlationId} → AI said ${formatResult.format} but data shape is Format B (longRatio=${longRatio.toFixed(2)}, emptyRatio=${emptyRatio.toFixed(2)}). Overriding to B.`);
    return {
      ...formatResult,
      format: 'B',
      confidence: Math.max(formatResult.confidence || 0, 85),
      reasoning: `Overridden from ${formatResult.format} to B: col_1 holds free-text and other product columns are empty across data rows.`,
      suggestedMapping: {
        internalItemNumber: 'col_0',
        description: 'col_1',
        manufacturer: '',
        itemNumber: '',
        typeDesignation: '',
        supplementary: '',
      },
    };
  }

  return formatResult;
}

module.exports = {
  processDetection
};
