const { readExcelFromBase64 } = require('./excelService');
const { detectFormat } = require('./openaiService');
const { logger } = require('../utils/logger');

async function processDetection(fileData, sheetIndex = 0, options = {}) {
  const { correlationId = 'internal' } = options;
  
  const { rows } = await readExcelFromBase64(fileData, sheetIndex);
  if (rows.length === 0) {
    throw new Error('No data found in sheet');
  }
  
  const sampleRows = rows.slice(0, 5);
  logger.info('Background detection starting', { correlationId, totalRows: rows.length });
  
  const result = await detectFormat(sampleRows, correlationId);
  return {
    ...result,
    rowCount: rows.length,
    sheetIndex
  };
}

module.exports = {
  processDetection
};
