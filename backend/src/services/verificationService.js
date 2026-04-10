const { config } = require('../config');
const { logger } = require('../utils/logger');
const { verifyRow } = require('./geminiService');
const { enforceRules } = require('./claudeService');
const { applyAllDeduplication, deduplicateVerified, mirrorOriginalLayout } = require('./deduplicationService');
const cacheService = require('./cacheService');
const { classifySupplementary, createChangeLog } = require('./supplementaryLogger');
const jobService = require('./jobService');
const geminiPoolModule = require('./geminiPool');

/**
 * Core verification logic extracted for use in both SSE and Background Jobs
 */
async function processRows(rows, options = {}) {
  const {
    correlationId = 'internal',
    onProgress = () => {},
    onRowComplete = () => {},
    onComplete = () => {},
    onError = () => {},
    batchSize: customBatchSize,
  } = options;

  const pLimit = (await import('p-limit')).default;
  const maxC = config.maxConcurrency || 15;

  // Initialize per-key Gemini pools (e.g. 3 keys × 15 = 45 concurrent)
  await geminiPoolModule.initPools();

  const rulePool = pLimit(maxC);
  const urlPool = pLimit(30);
  const mainPool = pLimit(maxC * geminiPoolModule.getKeyCount() || maxC);
  
  const actualBatchSize = customBatchSize || config.batchSize;
  const results = [];
  const changeLogs = [];
  let cacheHits = 0;
  let geminiCalls = 0;
  let fallbackCalls = 0;
  let mockCalls = 0;
  let errorCount = 0;
  let completed = 0;
  const total = rows.length;
  const startTime = Date.now();

  const ROW_HARD_TIMEOUT_MS = config.verificationTimeoutMs; 
  const withRowTimeout = (promise, rowIndex) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(
      () => reject(Object.assign(new Error(`Row timeout (${ROW_HARD_TIMEOUT_MS/1000}s)`), { __rowTimeout: true, rowIndex })),
      ROW_HARD_TIMEOUT_MS,
    )),
  ]);

  const tasks = rows.map(row => mainPool(async () => {
    const deduped = applyAllDeduplication(row);
    const internalItemNumber = deduped.internalItemNumber;
    const cacheKey = cacheService.makeCacheKey(deduped);
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      cacheHits++;
      completed++;
      const result = { ...cached, rowIndex: row.rowIndex, internalItemNumber };
      results.push(result);
      onRowComplete(result);
      onProgress({ 
        completed, 
        total, 
        batch: Math.ceil(completed / actualBatchSize),
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000) 
      });
      return;
    }
    
    try {
      let result = await withRowTimeout((async () => {
        // Step 1: Gemini verification (uses per-key pool from geminiPool)
        if (config.geminiMockMode) mockCalls++; else geminiCalls++;
        const pool = geminiPoolModule.getNextPool() || pLimit(15);
        let r = await pool(async () => {
          return await verifyRow(deduped, false, correlationId);
        });
        
        // Step 2 & 4: Rule enforcement and URL validation in parallel
        const rulePromise = (async () => {
          if (r.verificationScore < 70 && deduped.supplementary.trim()) {
            const suppType = classifySupplementary(deduped.supplementary);
            if (suppType === 'part_specification') {
              if (config.geminiMockMode) mockCalls++; else geminiCalls++;
              const suppPool = geminiPoolModule.getNextPool() || pool;
              const supplementaryResult = await suppPool(async () => {
                return await verifyRow(deduped, true, correlationId);
              });
              supplementaryResult.supplementaryUsed = true;
              return supplementaryResult;
            }
          }
          
          if (r.verificationScore < 70 || (!r.manufacturer || !r.manufacturer.trim())) {
            if (config.claudeMockMode) mockCalls++; else fallbackCalls++;
            return await rulePool(async () => {
              return await enforceRules(deduped, r, correlationId);
            });
          }
          return r;
        })();
        
        const urlPromise = (async () => {
          if (r.websiteId) {
            const { validateUrl } = require('./urlValidatorService');
            return await urlPool(async () => {
              const urlCheck = await validateUrl(r.websiteId);
              return { status: urlCheck.status, finalUrl: urlCheck.finalUrl };
            });
          }
          return null;
        })();
        
        const [ruleResult, urlResult] = await Promise.all([rulePromise, urlPromise]);
        r = ruleResult || r;
        
        if (urlResult) {
          if (urlResult.status === 'redirected' && urlResult.finalUrl) r.websiteId = urlResult.finalUrl;
          r.urlValidationStatus = urlResult.status;
        }
        
        return r;
      })(), row.rowIndex);
      
      result = deduplicateVerified(result);
      result = mirrorOriginalLayout(result, deduped);
      result.rowIndex = row.rowIndex;
      result.internalItemNumber = internalItemNumber;
      
      if (result.supplementaryChanged && result.supplementaryOriginal !== result.supplementary) {
        changeLogs.push(createChangeLog(row.rowIndex, result.supplementaryOriginal, result.supplementary, result.verificationScore, result.verificationScore < 70 ? 'claude-sonnet-4-6' : 'gemini-2.5-flash'));
      }
      
      cacheService.set(cacheKey, result, {
        manufacturer:     deduped.manufacturer     || null,
        item_number:      deduped.itemNumber       || null,
        type_designation: deduped.typeDesignation  || null,
        description:      deduped.description      || null,
      });
      
      results.push(result);
      completed++;
      onRowComplete(result);
      onProgress({ 
        completed, 
        total, 
        batch: Math.ceil(completed / actualBatchSize),
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000) 
      });
    } catch (error) {
      completed++;
      if (error && error.__rowTimeout) {
        const timeoutResult = {
          rowIndex: row.rowIndex,
          internalItemNumber,
          description: deduped.description || '',
          manufacturer: deduped.manufacturer || '',
          itemNumber: deduped.itemNumber || '',
          typeDesignation: deduped.typeDesignation || '',
          supplementary: deduped.supplementary || '',
          verifiedSource: 'Not found (Timeout)',
          verificationScore: 0,
          websiteId: '',
          sourceType: 'not_found',
          manufacturerWebsite: '',
          manufacturerInferred: false,
          supplementaryUsed: false,
          supplementaryChanged: false,
          supplementaryOriginal: '',
          supplementaryType: 'unknown',
          urlValidationStatus: 'unchecked',
        };
        results.push(timeoutResult);
        onRowComplete(timeoutResult);
        onProgress({ completed, total });
      } else {
        errorCount++;
        onError({ rowIndex: row.rowIndex, message: error.message || 'Unknown error' });
      }
    }
  }));

  await Promise.allSettled(tasks);

  // Error recovery: retry network-failed rows once after a 5s pause
  const processedIndexes = new Set(results.map(r => r.rowIndex));
  const failedRows = rows.filter(r => !processedIndexes.has(r.rowIndex));
  let retried = 0;
  let recoveredAfterRetry = 0;

  if (failedRows.length > 0) {
    logger.info(`[VERIFY] ${failedRows.length} rows failed. Waiting 5s before retry...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    const retryTasks = failedRows.map(row => mainPool(async () => {
      retried++;
      try {
        const deduped = applyAllDeduplication(row);
        const internalItemNumber = deduped.internalItemNumber;
        const retryPool = geminiPoolModule.getNextPool() || pLimit(15);
        let result = await withRowTimeout((async () => {
          return await retryPool(async () => verifyRow(deduped, false, correlationId));
        })(), row.rowIndex);
        result = deduplicateVerified(result);
        result = mirrorOriginalLayout(result, deduped);
        result.rowIndex = row.rowIndex;
        result.internalItemNumber = internalItemNumber;
        results.push(result);
        recoveredAfterRetry++;
        completed++;
        onRowComplete(result);
        onProgress({ completed, total });
        logger.info(`[VERIFY] Retry SUCCESS row ${row.rowIndex}`);
      } catch (err) {
        logger.warn(`[VERIFY] Retry FAILED row ${row.rowIndex}: ${err.message}`);
      }
    }));
    await Promise.allSettled(retryTasks);
  }

  results.sort((a, b) => a.rowIndex - b.rowIndex);

  const stats = computeStats(results);
  const permanentlyFailed = total - results.length;
  const summary = {
    total,
    geminiCalls,
    fallbackCalls,
    cacheHits,
    mockCalls,
    errorCount,
    retried,
    recoveredAfterRetry,
    permanentlyFailed,
    totalTime: Date.now() - startTime,
    results,
    changeLogs,
    stats
  };

  onComplete(summary);
  return summary;
}

function computeStats(results) {
  const stats = { totalRows: results.length, webVerified: 0, emptyCells: 0, scoreAbove90: 0, score50to89: 0, scoreBelow50: 0, officialSourceFound: 0, externalSourceFound: 0, notFound: 0 };
  for (const r of results) {
    if (r.verificationScore > 0) stats.webVerified++;
    if (r.verificationScore >= 90) stats.scoreAbove90++;
    else if (r.verificationScore >= 50) stats.score50to89++;
    else stats.scoreBelow50++;
    if (r.sourceType === 'official') stats.officialSourceFound++;
    else if (r.sourceType === 'external') stats.externalSourceFound++;
    else if (r.sourceType === 'not_found') stats.notFound++;
    stats.emptyCells += [r.description, r.manufacturer, r.itemNumber, r.websiteId].filter(f => !f || String(f).trim() === '').length;
  }
  return stats;
}

module.exports = {
  processRows,
  computeStats
};
