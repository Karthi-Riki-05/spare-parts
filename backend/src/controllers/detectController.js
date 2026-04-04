const { readExcelFromBase64 } = require('../services/excelService');
const { detectFormat } = require('../services/openaiService');
const { logger } = require('../utils/logger');

async function handleDetectFormat(req, res, next) {
  try {
    const { fileData, sheetIndex = 0 } = req.body;
    const { rows } = await readExcelFromBase64(fileData, sheetIndex);
    if (rows.length === 0) { res.status(400).json({ error: 'No data found' }); return; }
    const sampleRows = rows.slice(0, 5);
    logger.info('Detecting format', { correlationId: req.correlationId, totalRows: rows.length });
    const result = await detectFormat(sampleRows, req.correlationId);
    res.json({ ...result, rowCount: rows.length, sheetIndex });
  } catch (error) { next(error); }
}

module.exports = { handleDetectFormat };
