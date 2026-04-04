const { readExcelFromBase64 } = require('../services/excelService');
const { normalizeRow } = require('../services/openaiService');
const { applyAllDeduplication } = require('../services/deduplicationService');
const { handleErsPrefix } = require('../utils/ersHandler');
const { logger } = require('../utils/logger');

function extractVal(row, key) {
  const val = row[key];
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Strip Format B noise: trailing ", -" placeholder sequences
 */
function cleanFormatBNoise(rawText) {
  let cleaned = rawText.replace(/(\s*,\s*-)+\s*$/g, '').trim();
  cleaned = cleaned.replace(/\s*,\s*-\s*,\s*/g, ', ');
  return cleaned;
}

function normalizeFormatA(rows, mapping, format) {
  return rows.map((row, index) => {
    const keys = Object.keys(row);
    const m = mapping || {
      internalItemNumber: keys[0] || '', description: keys[1] || '', manufacturer: keys[2] || '',
      itemNumber: keys[3] || '', typeDesignation: keys[4] || '', supplementary: keys[5] || '',
    };
    const raw = {
      internalItemNumber: extractVal(row, m.internalItemNumber),
      description: extractVal(row, m.description),
      manufacturer: extractVal(row, m.manufacturer),
      itemNumber: extractVal(row, m.itemNumber),
      typeDesignation: extractVal(row, m.typeDesignation),
      supplementary: extractVal(row, m.supplementary),
      sparePartCategory: extractVal(row, keys[6] || ''),
      _originalFormat: format,
      rowIndex: index,
    };
    return handleErsPrefix(applyAllDeduplication(raw));
  });
}

async function normalizeFormatC(rows, correlationId, format) {
  return Promise.all(rows.map(async (row, index) => {
    const keys = Object.keys(row);
    const internalItemNumber = extractVal(row, keys[0] || '');

    const mfrVal = extractVal(row, keys[2] || '');
    const itemVal = extractVal(row, keys[3] || '');

    if (mfrVal && itemVal) {
      const raw = {
        internalItemNumber,
        description: extractVal(row, keys[1] || ''),
        manufacturer: mfrVal,
        itemNumber: itemVal,
        typeDesignation: extractVal(row, keys[4] || ''),
        supplementary: extractVal(row, keys[5] || ''),
        sparePartCategory: extractVal(row, keys[6] || ''),
        _originalFormat: format,
        rowIndex: index,
      };
      return handleErsPrefix(applyAllDeduplication(raw));
    }

    const rawText = keys.map(k => extractVal(row, k)).filter(Boolean).join(' ');
    const result = await normalizeRow(rawText, correlationId);
    const raw = {
      internalItemNumber,
      description: result.description,
      manufacturer: result.manufacturer,
      itemNumber: result.item_number,
      typeDesignation: result.type_designation,
      supplementary: result.supplementary,
      sparePartCategory: extractVal(row, keys[6] || ''),
      _originalFormat: format,
      rowIndex: index,
    };
    return handleErsPrefix(applyAllDeduplication(raw));
  }));
}

async function handleNormalize(req, res, next) {
  try {
    const { fileData, sheetIndex = 0, format, mapping } = req.body;
    const { rows: rawRows } = await readExcelFromBase64(fileData, sheetIndex);
    const originalData = [...rawRows];
    logger.info('Normalizing data', { correlationId: req.correlationId, format, rowCount: rawRows.length });

    let normalized;
    if (format === 'A') {
      normalized = normalizeFormatA(rawRows, mapping, 'A');
    } else if (format === 'B') {
      // Process each row independently — send ONLY col_1 to AI (not col_0 which is internal item number)
      const results = [];
      for (let index = 0; index < rawRows.length; index++) {
        const row = rawRows[index];
        const internalItemNumber = extractVal(row, 'col_0');
        // col_1 contains the spare part description text; col_0 is the internal ID
        const rawText = cleanFormatBNoise(extractVal(row, 'col_1'));
        if (!rawText) {
          // Skip empty rows
          results.push(handleErsPrefix(applyAllDeduplication({
            internalItemNumber, description: '', manufacturer: '',
            itemNumber: '', typeDesignation: '', supplementary: '',
            _originalFormat: 'B', rowIndex: index,
          })));
          continue;
        }
        const result = await normalizeRow(rawText, req.correlationId);
        const raw = {
          internalItemNumber,
          description: result.description,
          manufacturer: result.manufacturer,
          itemNumber: result.item_number,
          typeDesignation: result.type_designation,
          supplementary: result.supplementary,
          _originalFormat: 'B',
          rowIndex: index,
        };
        results.push(handleErsPrefix(applyAllDeduplication(raw)));
      }
      normalized = results;
    } else {
      normalized = await normalizeFormatC(rawRows, req.correlationId, 'C');
    }

    res.json({ rows: normalized, originalData, rawRows });
  } catch (error) { next(error); }
}

module.exports = { handleNormalize };
