const { readExcelFromBase64 } = require('../services/excelService');
const { applyAllDeduplication } = require('../services/deduplicationService');
const { handleErsPrefix } = require('../utils/ersHandler');
const { logger } = require('../utils/logger');

async function handleManualMap(req, res, next) {
  try {
    const { fileData, sheetIndex = 0, mapping } = req.body;
    const { rows: rawRows } = await readExcelFromBase64(fileData, sheetIndex);
    const originalData = [...rawRows];
    logger.info('Applying manual mapping', { correlationId: req.correlationId, rowCount: rawRows.length });

    const normalized = rawRows.map((row, index) => {
      const getVal = (key) => { const v = row[key]; return v == null ? '' : String(v).trim(); };
      const raw = {
        internalItemNumber: getVal(mapping.internalItemNumber),
        description: getVal(mapping.description), manufacturer: getVal(mapping.manufacturer),
        itemNumber: getVal(mapping.itemNumber), typeDesignation: getVal(mapping.typeDesignation),
        supplementary: getVal(mapping.supplementary),
        sparePartCategory: mapping.sparePartCategory ? getVal(mapping.sparePartCategory) : '',
        _originalFormat: 'B',
        rowIndex: index,
      };
      return handleErsPrefix(applyAllDeduplication(raw));
    });

    res.json({ rows: normalized, originalData });
  } catch (error) { next(error); }
}

module.exports = { handleManualMap };
