const { config } = require('../config');
const { logger } = require('../utils/logger');
const { verifyRow } = require('./geminiService');
const { enforceRules } = require('./claudeService');
const { applyAllDeduplication, deduplicateVerified, mirrorOriginalLayout } = require('./deduplicationService');
const cacheService = require('./cacheService');
const { classifySupplementary, createChangeLog } = require('./supplementaryLogger');
const jobService = require('./jobService');
const geminiPoolModule = require('./geminiPool');
const { isTrustedDomain } = require('./geminiCitationFilter');

/**
 * Core verification logic extracted for use in both SSE and Background Jobs
 */
// Col_0 is hidden from AI only when its Excel header clearly labels it as an
// internal/supplier item reference (per R1 / D-009). For any other header —
// e.g. "Description", "Model", "Notes" — the value IS useful context and is
// passed through to Gemini.
function shouldHideCol0FromAI(header) {
  if (!header) return true; // no header → safe default: hide
  const h = String(header).trim().toLowerCase();
  if (!h) return true;
  return /^(internal\s+)?(item|article|artikel|part|sku)\s*(#|no\.?|number|nummer|nr\.?)?$/.test(h)
      || /^art\.?\s*(nr\.?|no\.?|number)$/.test(h)
      || /^internal\s+(number|id)$/.test(h);
}

async function processRows(rows, options = {}) {
  const {
    correlationId = 'internal',
    onProgress = () => {},
    onRowComplete = () => {},
    onComplete = () => {},
    onError = () => {},
    batchSize: customBatchSize,
    originalHeaders = null,
  } = options;

  const col0Header = originalHeaders && originalHeaders.col_0 ? String(originalHeaders.col_0).trim() : '';
  const hideCol0 = shouldHideCol0FromAI(col0Header);
  logger.info(`[VERIFY] col0 header="${col0Header || '(none)'}" hideFromAI=${hideCol0}`);

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
    const cached = await cacheService.get(cacheKey);
    
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
    
    // Build per-row col0 context: null when header indicates an internal
    // item number (stays hidden from AI), populated otherwise so Gemini
    // can use the value as extra verification context.
    const col0Context = hideCol0
      ? null
      : { label: col0Header || 'First Column', value: internalItemNumber || '' };

    try {
      let result = await withRowTimeout((async () => {
        // Step 1: Gemini verification (uses per-key pool from geminiPool)
        if (config.geminiMockMode) mockCalls++; else geminiCalls++;
        const pool = geminiPoolModule.getNextPool() || pLimit(15);
        let r = await pool(async () => {
          return await verifyRow(deduped, false, correlationId, col0Context);
        });

        // Step 2 & 4: Rule enforcement and URL validation in parallel
        const rulePromise = (async () => {
          if (r.verificationScore < 70 && deduped.supplementary.trim()) {
            const suppType = classifySupplementary(deduped.supplementary);
            if (suppType === 'part_specification') {
              if (config.geminiMockMode) mockCalls++; else geminiCalls++;
              const suppPool = geminiPoolModule.getNextPool() || pool;
              const supplementaryResult = await suppPool(async () => {
                return await verifyRow(deduped, true, correlationId, col0Context);
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
            return await urlPool(() => validateUrl(r.websiteId));
          }
          return null;
        })();

        const [ruleResult, urlResult] = await Promise.all([rulePromise, urlPromise]);
        r = ruleResult || r;

        if (urlResult) {
          const vs = urlResult.validation_status;
          const prevScore = r.verificationScore || 0;
          const priorStatus = r.urlValidationStatus || '';
          const isCitationStatus =
            priorStatus === 'citation_confirmed' ||
            priorStatus === 'citation_partial' ||
            priorStatus === 'citation_replaced' ||
            priorStatus === 'no_citations_fallback';

          if (vs === 'confirmed') {
            // 2xx / 3xx — URL confirmed. Adopt final URL after redirects.
            if (urlResult.finalUrl && urlResult.finalUrl !== r.websiteId) {
              r.websiteId = urlResult.finalUrl;
            }
            // Preserve stronger citation_* status if present; otherwise
            // record the HTTP confirmation.
            if (!isCitationStatus) r.urlValidationStatus = 'confirmed';
          } else if (vs === 'bot_blocked') {
            // 401/403/other 4xx — page exists but server blocked us.
            // Trust depends on whether the domain is on the allowlist of
            // known manufacturer/distributor sites with real anti-bot walls.
            const trusted = isTrustedDomain(r.websiteId);
            const cap = trusted ? 85 : 60;
            const capped = prevScore > cap ? cap : prevScore;
            if (capped !== prevScore) {
              logger.info(`[VERIFY] URL_BOT_BLOCKED row=${row.rowIndex} trusted=${trusted} reason=${urlResult.reason || 'unknown'} score=${prevScore}->${capped} url=${r.websiteId}`);
            }
            r.verificationScore = capped;
            if (!isCitationStatus) {
              r.urlValidationStatus = trusted ? 'bot_blocked_trusted' : 'bot_blocked_untrusted';
            }
          } else if (vs === 'unverified') {
            // 5xx / timeout / network error — keep URL, cap score at 70.
            const capped = prevScore > 70 ? 70 : prevScore;
            if (capped !== prevScore) {
              logger.info(`[VERIFY] URL_UNVERIFIED row=${row.rowIndex} reason=${urlResult.reason || 'unknown'} score=${prevScore}->${capped} url=${r.websiteId}`);
            }
            r.verificationScore = capped;
            if (r.sourceType === 'official') r.sourceType = 'unverified';
            if (!isCitationStatus) r.urlValidationStatus = 'unverified';
          } else if (vs === 'broken_404' || vs === 'broken_error') {
            // Hard reject — URL cannot be recovered. Clear it and zero the
            // score (no URL ⇒ no score; invariant enforced below).
            logger.warn(`[VERIFY] URL_VALIDATION_FAILED row=${row.rowIndex} reason=${urlResult.reason || vs} score=${prevScore}->0 url=${r.websiteId}`);
            r.websiteId = '';
            r.verificationScore = 0;
            r.sourceType = 'not_found';
            r.urlValidationStatus = vs;
          } else {
            r.urlValidationStatus = vs || 'unverified';
          }
        }

        // Invariant: a score without a website URL is meaningless to the
        // user. If we end up with no websiteId (Gemini never returned one,
        // or it was stripped by the validator / citation filter), force the
        // score to 0 so the table never shows "55 with no link".
        if (!r.websiteId || !String(r.websiteId).trim()) {
          if (r.verificationScore && r.verificationScore > 0) {
            logger.info(`[VERIFY] SCORE_ZEROED_NO_URL row=${row.rowIndex} score=${r.verificationScore}->0 status=${r.urlValidationStatus || 'n/a'}`);
          }
          r.verificationScore = 0;
          if (r.sourceType !== 'not_found') r.sourceType = 'not_found';
        }
        
        return r;
      })(), row.rowIndex);
      
      result = deduplicateVerified(result);
      result = mirrorOriginalLayout(result, deduped);
      result.rowIndex = row.rowIndex;
      result.internalItemNumber = internalItemNumber;

      // Supplementary protection: always restore original unless explicitly flagged as changed
      if (!result.supplementaryChanged) {
        result.supplementary = row.supplementary || '';
      }

      if (result.supplementaryChanged && result.supplementaryOriginal !== result.supplementary) {
        changeLogs.push(createChangeLog(row.rowIndex, result.supplementaryOriginal, result.supplementary, result.verificationScore, result.verificationScore < 70 ? 'claude-sonnet-4-6' : 'gemini-2.5-flash'));
      }
      
      await cacheService.set(cacheKey, result, {
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

  try {
    await onComplete(summary);
  } catch (err) {
    logger.error(`[VERIFY] onComplete callback failed: ${err.message}`);
  }
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
