const { config } = require('../config');
const { logger } = require('../utils/logger');
const { normalizeRowsBatch, normalizeRow } = require('./openaiService');
const { applyAllDeduplication } = require('./deduplicationService');
const { handleErsPrefix } = require('../utils/ersHandler');

// Race a promise against an abort signal. If the signal fires while the
// promise is in-flight, rejects immediately with __cancelled=true so the
// caller can return [] from the batch without waiting for the AI call to finish.
function raceWithSignal(promise, signal) {
  if (!signal) return promise;
  let onAbort;
  const abortPromise = new Promise((_, reject) => {
    if (signal.aborted) {
      const err = new Error('Batch aborted');
      err.__cancelled = true;
      return reject(err);
    }
    onAbort = () => {
      const err = new Error('Batch aborted');
      err.__cancelled = true;
      reject(err);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  return Promise.race([promise, abortPromise]).finally(() => {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  });
}

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
    // Capture pre-dedup original text for language toggle feature
    const _originalFields = {
      description: raw.description,
      manufacturer: raw.manufacturer,
      itemNumber: raw.itemNumber,
      typeDesignation: raw.typeDesignation,
      supplementary: raw.supplementary,
    };
    const normalized = handleErsPrefix(applyAllDeduplication(raw));
    return { ...normalized, _originalFields };
  });
}

async function processNormalization(rows, options = {}) {
  const {
    format,
    mapping,
    offset = 0,
    correlationId = 'internal',
    onProgress = () => {},
    signal = null,
  } = options;

  function makeCancelError(partial) {
    const err = new Error('Normalization cancelled');
    err.__cancelled = true;
    err.partial = partial || [];
    return err;
  }

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
    const batchResults = await Promise.allSettled(batches.map((batch) => limit(async () => {
      // Check abort before starting — queued tasks are dropped immediately
      if (signal?.aborted) return [];

      const nonEmpty = batch.filter(r => r.rawText);
      let results = [];
      if (nonEmpty.length > 0) {
        try {
          results = await raceWithSignal(
            normalizeRowsBatch(nonEmpty.map(r => ({ text: r.rawText })), correlationId),
            signal
          );
        } catch (batchErr) {
          // Abort mid-batch — abandon immediately, return nothing from this slot
          if (batchErr.__cancelled || signal?.aborted) return [];
          // Batch failed for real — retry individual rows
          logger.warn(`[NORMALIZE] Batch of ${nonEmpty.length} rows failed: ${batchErr.message}. Retrying individually...`);
          results = [];
          for (const item of nonEmpty) {
            if (signal?.aborted) break;
            try {
              const single = await raceWithSignal(normalizeRow(item.rawText, correlationId), signal);
              results.push(single);
              logger.info(`[NORMALIZE] Row ${item.internalItemNumber || item.index} recovered individually`);
            } catch (rowErr) {
              if (rowErr.__cancelled || signal?.aborted) break;
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
          return { internalItemNumber: r.internalItemNumber, description: '', manufacturer: '', itemNumber: '', typeDesignation: '', supplementary: '', rowIndex: r.index, _originalFields: { description: r.rawText || '', manufacturer: '', itemNumber: '', typeDesignation: '', supplementary: '' }, _svFields: { description: r.rawText || '', manufacturer: '', itemNumber: '', typeDesignation: '', supplementary: '' } };
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
          // Preserve raw Format B text as original so the language toggle shows the source column
          _originalFields: { description: r.rawText || '', manufacturer: '', itemNumber: '', typeDesignation: '', supplementary: '' },
          // SV = extracted fields (manufacturer/itemNumber) but description in original Swedish
          _svFields: { description: result.sv_description || result.description || '', manufacturer: result.manufacturer || '', itemNumber: result.item_number || '', typeDesignation: result.type_designation || '', supplementary: result.supplementary || '' },
        };
      });

      completedCount += batch.length;
      onProgress({ completed: completedCount, total });
      return reconstructed;
    })));

    // Collect partial results from all settled batches (some may be empty due to abort check)
    const flattenedB = batchResults
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);

    if (signal?.aborted) throw makeCancelError(
      flattenedB.map(result => {
        const _originalFields = result._originalFields;
        const _svFields = result._svFields;
        const deduped = handleErsPrefix(applyAllDeduplication({ ...result, _originalFormat: 'B' }));
        return { ...deduped, _originalFields, _svFields };
      })
    );

    normalized = flattenedB.map(result => {
      const _originalFields = result._originalFields;
      const _svFields = result._svFields;
      const deduped = handleErsPrefix(applyAllDeduplication({ ...result, _originalFormat: 'B' }));
      return { ...deduped, _originalFields, _svFields };
    });
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
      const batchResultSets = await Promise.allSettled(batches.map((batch) => limit(async () => {
        if (signal?.aborted) return [];
        const keys = Object.keys(batch[0].row);
        const texts = batch.map(({ row }) => keys.map(k => extractVal(row, k)).filter(Boolean).join(' '));
        const results = await raceWithSignal(
          normalizeRowsBatch(texts.map(text => ({ text })), correlationId),
          signal
        );

        const finalResults = batch.map(({ index }, i) => ({ index, ...results[i] }));
        completedAi += batch.length;
        onProgress({ completed: Math.round((completedAi / rowsNeedingAi.length) * total), total });
        return finalResults;
      })));

      if (signal?.aborted) throw makeCancelError([]);
      batchResultSets
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .forEach(r => { aiResults[r.index] = r; });
    }
    
    const allResults = [...rowsWithoutAi, ...rowsNeedingAi].sort((a, b) => a.index - b.index);
    normalized = allResults.map(({ row, index, needsAi }) => {
      const keys = Object.keys(row);
      const internalItemNumber = extractVal(row, keys[0] || '');
      let raw;
      // Original values from Excel before any AI processing
      const origDesc = extractVal(row, keys[1] || '');
      const origMfr  = extractVal(row, keys[2] || '');
      const origItem = extractVal(row, keys[3] || '');
      const origType = extractVal(row, keys[4] || '');
      const origSupp = extractVal(row, keys[5] || '');
      let _svFields = null;
      if (needsAi && aiResults[index]) {
        const result = aiResults[index];
        raw = { internalItemNumber, description: result.description, manufacturer: result.manufacturer, itemNumber: result.item_number, typeDesignation: result.type_designation, supplementary: result.supplementary, sparePartCategory: extractVal(row, keys[6] || ''), _originalFormat: format, rowIndex: index };
        _svFields = { description: result.sv_description || result.description || '', manufacturer: result.manufacturer || '', itemNumber: result.item_number || '', typeDesignation: result.type_designation || '', supplementary: result.supplementary || '' };
      } else {
        raw = { internalItemNumber, description: origDesc, manufacturer: origMfr, itemNumber: origItem, typeDesignation: origType, supplementary: origSupp, sparePartCategory: extractVal(row, keys[6] || ''), _originalFormat: format, rowIndex: index };
      }
      const _originalFields = { description: origDesc, manufacturer: origMfr, itemNumber: origItem, typeDesignation: origType, supplementary: origSupp };
      const deduped = handleErsPrefix(applyAllDeduplication(raw));
      return { ...deduped, _originalFields, ...(_svFields ? { _svFields } : {}) };
    });
    onProgress({ completed: total, total });
  }

  return normalized;
}

module.exports = {
  processNormalization,
  extractVal
};
