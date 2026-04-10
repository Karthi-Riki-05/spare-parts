const { readExcelFromBase64 } = require('../services/excelService');
const normalizationService = require('../services/normalizationService');
const { logger } = require('../utils/logger');

async function handleNormalize(req, res, next) {
  try {
    const { fileData, sheetIndex = 0, format, mapping, limit: reqLimit, offset = 0 } = req.body;
    const { rows: fullRows } = await readExcelFromBase64(fileData, sheetIndex);
    const rawRows = reqLimit ? fullRows.slice(offset, offset + reqLimit) : fullRows;
    const originalData = [...rawRows];
    
    logger.info('Normalizing data chunk (SSE)', { correlationId: req.correlationId, format, rowCount: rawRows.length, offset });

    const normalized = await normalizationService.processNormalization(rawRows, {
      format,
      mapping,
      offset,
      correlationId: req.correlationId
    });

    res.json({ rows: normalized, originalData, rawRows, totalOriginalRows: fullRows.length });
  } catch (error) { next(error); }
}

module.exports = { handleNormalize };
