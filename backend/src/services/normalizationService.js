const { config } = require('../config');
const { logger } = require('../utils/logger');
const { normalizeRowsBatch, normalizeRow } = require('./openaiService');
const { applyAllDeduplication } = require('./deduplicationService');
const { handleErsPrefix } = require('../utils/ersHandler');

function extractVal(row, key) {
  const val = row[key];
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

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

async function processNormalization(rows, options = {}) {
  const {
    format,
    mapping,
    offset = 0,
    correlationId = 'internal',
    onProgress = () => {},
  } = options;

  let normalized;
  const total = rows.length;

  if (format === 'A') {
    normalized = normalizeFormatA(rows, mapping, 'A', offset);
    onProgress({ completed: total, total });
  } else if (format === 'B') {
    const pLimit = (await import('p-limit')).default;
    const BATCH_SIZE = config.batchSize || 5;
    
    const uniqueKeys = new Set([config.geminiApiKey, config.geminiApiKey2, config.geminiApiKey3].filter(k => k && k.trim()));
    const keyCount = uniqueKeys.size;
    const concurrency = keyCount > 1 ? (keyCount * 5) : 3; 
    const limit = pLimit(concurrency);
    
    logger.info(`Normalization starting with BATCH_SIZE=${BATCH_SIZE}, Concurrency=${concurrency}`);
    const rowsToNormalize = rows.map((row, index) => ({
      row, 
      index: offset + index,
      internalItemNumber: extractVal(row, 'col_0'),
      rawText: cleanFormatBNoise(extractVal(row, 'col_1')),
    }));
    
    const batches = [];
    for (let i = 0; i < rowsToNormalize.length; i += BATCH_SIZE) {
      batches.push(rowsToNormalize.slice(i, i + BATCH_SIZE));
    }
    
    let completedCount = 0;
    const batchResults = await Promise.all(batches.map((batch) => limit(async () => {
      const nonEmpty = batch.filter(r => r.rawText);
      let results = [];
      if (nonEmpty.length > 0) {
        try {
          results = await normalizeRowsBatch(nonEmpty.map(r => ({ text: r.rawText })), correlationId);
        } catch (batchErr) {
          // Batch failed — retry individual rows
          logger.warn(`[NORMALIZE] Batch of ${nonEmpty.length} rows failed: ${batchErr.message}. Retrying individually...`);
          results = [];
          for (const item of nonEmpty) {
            try {
              const single = await normalizeRow(item.rawText, correlationId);
              results.push(single);
              logger.info(`[NORMALIZE] Row ${item.internalItemNumber || item.index} recovered individually`);
            } catch (rowErr) {
              results.push({
                description: item.rawText || '',
                manufacturer: '',
                item_number: '',
                type_designation: '',
                supplementary: '',
                _normalizeError: rowErr.message,
              });
              logger.warn(`[NORMALIZE] Row ${item.internalItemNumber || item.index} permanently failed: ${rowErr.message}`);
            }
          }
        }
      }

      const reconstructed = batch.map(r => {
        const nonEmptyIdx = nonEmpty.findIndex(ne => ne.index === r.index);
        if (nonEmptyIdx === -1) {
          return { internalItemNumber: r.internalItemNumber, description: '', manufacturer: '', itemNumber: '', typeDesignation: '', supplementary: '', rowIndex: r.index };
        }
        const result = results[nonEmptyIdx] || {};
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

      completedCount += batch.length;
      onProgress({ completed: completedCount, total });
      return reconstructed;
    })));
    
    normalized = batchResults.flat().map(result => handleErsPrefix(applyAllDeduplication({
      ...result,
      _originalFormat: 'B',
    })));
  } else {
    // Format C
    const BATCH_SIZE = config.batchSize || 5;
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(4);
    
    const rowsNeedingAi = [];
    const rowsWithoutAi = [];
    
    rows.forEach((row, index) => {
      const originalIndex = offset + index;
      const keys = Object.keys(row);
      const mfrVal = extractVal(row, keys[2] || '');
      const itemVal = extractVal(row, keys[3] || '');
      if (mfrVal && itemVal) {
        rowsWithoutAi.push({ row, index: originalIndex, needsAi: false });
      } else {
        rowsNeedingAi.push({ row, index: originalIndex, needsAi: true });
      }
    });
    
    const aiResults = {};
    if (rowsNeedingAi.length > 0) {
      const batches = [];
      for (let i = 0; i < rowsNeedingAi.length; i += BATCH_SIZE) {
        batches.push(rowsNeedingAi.slice(i, i + BATCH_SIZE));
      }
      
      let completedAi = 0;
      const batchResultSets = await Promise.all(batches.map((batch) => limit(async () => {
        const keys = Object.keys(batch[0].row);
        const texts = batch.map(({ row }) => keys.map(k => extractVal(row, k)).filter(Boolean).join(' '));
        const results = await normalizeRowsBatch(texts.map(text => ({ text })), correlationId);
        
        const finalResults = batch.map(({ index }, i) => ({ index, ...results[i] }));
        completedAi += batch.length;
        onProgress({ completed: Math.round((completedAi / rowsNeedingAi.length) * total), total });
        return finalResults;
      })));
      
      batchResultSets.flat().forEach(r => { aiResults[r.index] = r; });
    }
    
    const allResults = [...rowsWithoutAi, ...rowsNeedingAi].sort((a, b) => a.index - b.index);
    normalized = allResults.map(({ row, index, needsAi }) => {
      const keys = Object.keys(row);
      const internalItemNumber = extractVal(row, keys[0] || '');
      let raw;
      if (needsAi && aiResults[index]) {
        const result = aiResults[index];
        raw = { internalItemNumber, description: result.description, manufacturer: result.manufacturer, itemNumber: result.item_number, typeDesignation: result.type_designation, supplementary: result.supplementary, sparePartCategory: extractVal(row, keys[6] || ''), _originalFormat: format, rowIndex: index };
      } else {
        raw = { internalItemNumber, description: extractVal(row, keys[1] || ''), manufacturer: extractVal(row, keys[2] || ''), itemNumber: extractVal(row, keys[3] || ''), typeDesignation: extractVal(row, keys[4] || ''), supplementary: extractVal(row, keys[5] || ''), sparePartCategory: extractVal(row, keys[6] || ''), _originalFormat: format, rowIndex: index };
      }
      return handleErsPrefix(applyAllDeduplication(raw));
    });
    onProgress({ completed: total, total });
  }

  return normalized;
}

module.exports = {
  processNormalization,
  extractVal
};
