const { readExcelFromBase64 } = require('../services/excelService');
const { normalizeRow, normalizeRowsBatch } = require('../services/openaiService');
const { applyAllDeduplication } = require('../services/deduplicationService');
const { handleErsPrefix } = require('../utils/ersHandler');
const { logger } = require('../utils/logger');
const { config } = require('../config');

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

function normalizeFormatA(rows, mapping, format, offset = 0) {
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
      rowIndex: offset + index,
    };
    return handleErsPrefix(applyAllDeduplication(raw));
  });
}

async function normalizeFormatC(rows, correlationId, format, offset = 0) {
  // Format C: Batch rows that need AI processing
  const BATCH_SIZE = 10;
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(4); // Lower concurrency for batch processing
  
  const rowsNeedingAi = [];
  const rowsWithoutAi = [];
  
  rows.forEach((row, index) => {
    const originalIndex = offset + index;
    const keys = Object.keys(row);
    const mfrVal = extractVal(row, keys[2] || '');
    const itemVal = extractVal(row, keys[3] || '');
    
    if (mfrVal && itemVal) {
      // Already has manufacturer and item — no AI needed
      rowsWithoutAi.push({ row, index: originalIndex, needsAi: false });
    } else {
      // Missing data — needs AI
      rowsNeedingAi.push({ row, index: originalIndex, needsAi: true });
    }
  });
  
  // Process rows that need AI in batches
  const aiResults = {};
  if (rowsNeedingAi.length > 0) {
    const batches = [];
    for (let i = 0; i < rowsNeedingAi.length; i += BATCH_SIZE) {
      batches.push(rowsNeedingAi.slice(i, i + BATCH_SIZE));
    }
    
    const batchResultSets = await Promise.all(batches.map((batch) => limit(async () => {
      const keys = Object.keys(batch[0].row);
      const texts = batch.map(({ row }) => 
        keys.map(k => extractVal(row, k)).filter(Boolean).join(' ')
      );
      const results = await normalizeRowsBatch(texts.map(text => ({ text })), correlationId);
      
      return batch.map(({ index }, i) => ({
        index,
        ...results[i],
      }));
    })));
    
    // Flatten results into map
    batchResultSets.flat().forEach(r => {
      aiResults[r.index] = r;
    });
  }
  
  // Combine all results in original order
  const allResults = [...rowsWithoutAi, ...rowsNeedingAi].sort((a, b) => a.index - b.index);
  
  return allResults.map(({ row, index, needsAi }) => {
    const keys = Object.keys(row);
    const internalItemNumber = extractVal(row, keys[0] || '');
    
    let result;
    if (needsAi && aiResults[index]) {
      result = aiResults[index];
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
    } else {
      // No AI needed — use direct values
      const raw = {
        internalItemNumber,
        description: extractVal(row, keys[1] || ''),
        manufacturer: extractVal(row, keys[2] || ''),
        itemNumber: extractVal(row, keys[3] || ''),
        typeDesignation: extractVal(row, keys[4] || ''),
        supplementary: extractVal(row, keys[5] || ''),
        sparePartCategory: extractVal(row, keys[6] || ''),
        _originalFormat: format,
        rowIndex: index,
      };
      return handleErsPrefix(applyAllDeduplication(raw));
    }
  });
}

async function handleNormalize(req, res, next) {
  try {
    const { fileData, sheetIndex = 0, format, mapping, limit: reqLimit, offset = 0 } = req.body;
    const { rows: fullRows } = await readExcelFromBase64(fileData, sheetIndex);
    const rawRows = reqLimit ? fullRows.slice(offset, offset + reqLimit) : fullRows;
    const originalData = [...rawRows];
    logger.info('Normalizing data chunk', { correlationId: req.correlationId, format, rowCount: rawRows.length, offset });

    let normalized;
    if (format === 'A') {
      // Format A: no AI needed, just direct column mapping
      normalized = normalizeFormatA(rawRows, mapping, 'A', offset);
    } else if (format === 'B') {
      // Format B: batch AI calls — 10 rows per call instead of 1 row per call
      // This reduces 100 calls to 10 calls, speeding up processing ~90%
      const pLimit = (await import('p-limit')).default;
      const BATCH_SIZE = 20; 
      
      const uniqueKeys = new Set([config.geminiApiKey, config.geminiApiKey2, config.geminiApiKey3].filter(k => k && k.trim()));
      const keyCount = uniqueKeys.size;
      const concurrency = keyCount > 1 ? (keyCount * 5) : 3; 
      const limit = pLimit(concurrency);
      
      logger.info(`Normalization starting with BATCH_SIZE=${BATCH_SIZE}, Concurrency=${concurrency} (${keyCount} UNIQUE keys)`);
      const rowsToNormalize = rawRows.map((row, index) => ({
        row, 
        index: offset + index,
        internalItemNumber: extractVal(row, 'col_0'),
        rawText: cleanFormatBNoise(extractVal(row, 'col_1')),
      }));
      
      // Group into batches
      const batches = [];
      for (let i = 0; i < rowsToNormalize.length; i += BATCH_SIZE) {
        batches.push(rowsToNormalize.slice(i, i + BATCH_SIZE));
      }
      
      // Process batches in parallel
      const batchResults = await Promise.all(batches.map((batch, batchIdx) => limit(async () => {
        // Filter out empty rows
        const nonEmpty = batch.filter(r => r.rawText);
        if (!nonEmpty.length) {
          // All rows in batch are empty
          return batch.map(r => ({
            internalItemNumber: r.internalItemNumber,
            description: '',
            manufacturer: '',
            itemNumber: '',
            typeDesignation: '',
            supplementary: '',
            rowIndex: r.index,
          }));
        }
        
        // Call batch API for non-empty rows
        const batchResults = await normalizeRowsBatch(nonEmpty.map(r => ({ text: r.rawText })), req.correlationId);
        
        // Reconstruct with original order (including empty rows)
        return batch.map(r => {
          const nonEmptyIdx = nonEmpty.findIndex(ne => ne.index === r.index);
          if (nonEmptyIdx === -1) {
            // Empty row
            return { internalItemNumber: r.internalItemNumber, description: '', manufacturer: '', itemNumber: '', typeDesignation: '', supplementary: '', rowIndex: r.index };
          }
          const result = batchResults[nonEmptyIdx] || {};
          return {
            internalItemNumber: r.internalItemNumber || '',
            description: result.description || '',
            manufacturer: result.manufacturer || '',
            itemNumber: result.item_number || '',
            typeDesignation: result.type_designation || '',
            supplementary: result.supplementary || '',
            rowIndex: r.index,
          };
        });
      })));
      
      // Flatten results back to original order
      const flatResults = batchResults.flat();
      normalized = flatResults.map(result => handleErsPrefix(applyAllDeduplication({
        ...result,
        _originalFormat: 'B',
      })));
    } else {
      // Format C: similar batching approach
      normalized = await normalizeFormatC(rawRows, req.correlationId, 'C', offset);
    }

    res.json({ rows: normalized, originalData, rawRows, totalOriginalRows: fullRows.length });
  } catch (error) { next(error); }
}

module.exports = { handleNormalize };
