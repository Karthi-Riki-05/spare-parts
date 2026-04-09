const { config } = require('../config');
const { logger } = require('../utils/logger');
const { verifyRow } = require('../services/geminiService');
const { enforceRules } = require('../services/claudeService');
const { applyAllDeduplication, deduplicateVerified, mirrorOriginalLayout } = require('../services/deduplicationService');
const cacheService = require('../services/cacheService');
const { classifySupplementary, createChangeLog } = require('../services/supplementaryLogger');

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
    stats.emptyCells += [r.description, r.manufacturer, r.itemNumber, r.websiteId].filter(f => !f || f.trim() === '').length;
  }
  return stats;
}

async function handleVerify(req, res, next) {
  try {
    const { rows, batchSize } = req.body;
    const pLimit = (await import('p-limit')).default;
    
    // Create 3 independent pools for parallel processing
    const maxC = config.maxConcurrency || 5;
    const geminiPool = pLimit(Math.max(15, maxC));  // Ensure AI pool is at least as large as orchestration
    const rulePool = pLimit(maxC);
    const urlPool = pLimit(30);
    
    const mainPool = pLimit(maxC);
    const actualBatchSize = batchSize || config.batchSize;
    const correlationId = req.correlationId;

    logger.info('Starting verification', { correlationId, rowCount: rows.length, maxConcurrency: maxC, timeout: config.verificationTimeoutMs });

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
    const send = (event) => { if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); };

    const results = [];
    const changeLogs = [];
    let cacheHits = 0;
    let geminiCalls = 0;
    let fallbackCalls = 0;
    let mockCalls = 0;
    let errorCount = 0;
    let completed = 0;
    const total = rows.length;
    const totalBatches = Math.ceil(total / actualBatchSize);
    const startTime = Date.now();

    const ROW_HARD_TIMEOUT_MS = config.verificationTimeoutMs; 
    const withRowTimeout = (promise, rowIndex) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(
        () => reject(Object.assign(new Error(`Row timeout (${ROW_HARD_TIMEOUT_MS/1000}s)`), { __rowTimeout: true, rowIndex })),
        ROW_HARD_TIMEOUT_MS,
      )),
    ]);

    let aborted = false;
    req.on('close', () => { aborted = true; });

    const tasks = rows.map(row => mainPool(async () => {
      if (res.destroyed || aborted) return;
      const deduped = applyAllDeduplication(row);
      const internalItemNumber = deduped.internalItemNumber;
      const cacheKey = cacheService.makeCacheKey(deduped);
      const cached = cacheService.get(cacheKey);
      
      if (cached) {
        cacheHits++;
        completed++;
        const layer = cached.__cacheLayer === 'L2' ? 'L2 CACHE HIT (SQLite)' : 'L1 CACHE HIT (RAM)';
        logger.info(`[WEB VERIFY] Row ${correlationId} → ${layer} (no API call)`);
        const result = { ...cached, rowIndex: row.rowIndex, internalItemNumber };
        results.push(result);
        send({ type: 'row_complete', result });
        send({ type: 'progress', batch: Math.ceil(completed / actualBatchSize), totalBatches, completed, total, elapsedSeconds: Math.round((Date.now() - startTime) / 1000) });
        return;
      }
      
      try {
        const bail = () => { if (aborted || res.destroyed) throw Object.assign(new Error('client aborted'), { __aborted: true }); };
        
        let result = await withRowTimeout((async () => {
          bail();
          
          // Step 1: Gemini verification (pool: 15 concurrent)
          if (config.geminiMockMode) mockCalls++; else geminiCalls++;
          let r = await geminiPool(async () => {
            bail();
            return await verifyRow(deduped, false, correlationId);
          });
          bail();
          
          // Step 2 & 4: Rule enforcement (if needed) and URL validation run in parallel
          const rulePromise = (async () => {
            if (r.verificationScore < 70 && deduped.supplementary.trim()) {
              const suppType = classifySupplementary(deduped.supplementary);
              if (suppType === 'part_specification') {
                if (config.geminiMockMode) mockCalls++; else geminiCalls++;
                const supplementaryResult = await geminiPool(async () => {
                  bail();
                  return await verifyRow(deduped, true, correlationId);
                });
                bail();
                supplementaryResult.supplementaryUsed = true;
                return supplementaryResult;
              }
            }
            
            // Step 3: Rule enforcement (if needed, parallel to URL validation)
            const needsManufacturerInference = !r.manufacturer || !r.manufacturer.trim();
            if (r.verificationScore < 70 || needsManufacturerInference) {
              if (config.claudeMockMode) mockCalls++; else fallbackCalls++;
              return await rulePool(async () => {
                bail();
                return await enforceRules(deduped, r, correlationId);
              });
            }
            return r;
          })();
          
          const urlPromise = (async () => {
            // Step 4: URL validation (parallel to rule enforcement)
            if (r.websiteId) {
              const { validateUrl } = require('../services/urlValidatorService');
              return await urlPool(async () => {
                bail();
                const urlCheck = await validateUrl(r.websiteId);
                return { status: urlCheck.status, finalUrl: urlCheck.finalUrl };
              });
            }
            return null;
          })();
          
          // Wait for both rule enforcement and URL validation to complete
          const [ruleResult, urlResult] = await Promise.all([rulePromise, urlPromise]);
          r = ruleResult || r; // Use rule result if it was updated
          
          // Step 5: Merge URL validation results
          if (urlResult) {
            if (urlResult.status === 'redirected' && urlResult.finalUrl) {
              r.websiteId = urlResult.finalUrl;
            }
            r.urlValidationStatus = urlResult.status;
          }
          
          return r;
        })(), row.rowIndex);
        
        // URL validation note
        if (result.urlValidationStatus === 'broken' || result.urlValidationStatus === 'timeout') {
          logger.info(`[VERIFY] Row ${correlationId} → URL validation failed (${result.urlValidationStatus}) but score=${result.verificationScore} kept.`);
        }
        
        // Block score/source_type inconsistency
        if (result.verificationScore >= 70 && result.sourceType === 'not_found') {
          const vs = (result.verifiedSource || '').toLowerCase();
          let newSourceType;
          if (vs.includes('manufacturer')) newSourceType = 'official';
          else if (vs.includes('distributor') || vs.includes('store') || vs.includes('reseller')) newSourceType = 'distributor';
          else newSourceType = 'unknown';
          logger.info(`[VERIFY] Row ${correlationId} → source_type corrected to ${newSourceType}`);
          result.sourceType = newSourceType;
        }
        
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
        send({ type: 'row_complete', result });
        send({ type: 'progress', batch: Math.ceil(completed / actualBatchSize), totalBatches, completed, total, elapsedSeconds: Math.round((Date.now() - startTime) / 1000) });
      } catch (error) {
        if (error && error.__aborted) return;
        completed++;
        if (error && error.__rowTimeout) {
          logger.warn(`[VERIFY] Row ${correlationId} → row ${row.rowIndex} hit 30s timeout, marking timeout and continuing`);
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
          send({ type: 'row_complete', result: timeoutResult });
          send({ type: 'progress', batch: Math.ceil(completed / actualBatchSize), totalBatches, completed, total, elapsedSeconds: Math.round((Date.now() - startTime) / 1000) });
        } else {
          errorCount++;
          send({ type: 'error', rowIndex: row.rowIndex, message: error.message || 'Unknown error' });
        }
      }
    }));

    await Promise.all(tasks);
    clearInterval(heartbeat);
    results.sort((a, b) => a.rowIndex - b.rowIndex);

    // Cache collision detection
    const verifiedDescriptions = results.map(r => r.description).filter(Boolean);
    const uniqueVerified = new Set(verifiedDescriptions);
    if (verifiedDescriptions.length > 10 && uniqueVerified.size / verifiedDescriptions.length < 0.2) {
      logger.error(
        `[VERIFY] Quality check FAILED: only ${uniqueVerified.size} unique descriptions ` +
        `out of ${verifiedDescriptions.length} rows. Cache collision likely. Flushing cache.`
      );
      cacheService.flush();
    }

    const totalMs = Date.now() - startTime;
    const summary = [
      '─────────────────────────────────────────',
      ' VERIFICATION SUMMARY',
      '─────────────────────────────────────────',
      ` Total rows processed : ${total}`,
      ` Gemini API calls     : ${geminiCalls} (web verify)`,
      ` Gemini fallback calls: ${fallbackCalls} (rule enforce)`,
      ` Cache hits           : ${cacheHits}`,
      ` Mock calls           : ${mockCalls} (should be 0)`,
      ` Errors               : ${errorCount}`,
      ` Total time           : ${totalMs}ms (${Math.round(totalMs / total)}ms per row avg)`,
      '─────────────────────────────────────────',
    ];
    for (const l of summary) logger.info(l);

    send({ type: 'complete', response: { results, changeLogs, stats: computeStats(results), cacheHits } });
    res.end();
  } catch (error) { next(error); }
}

module.exports = { handleVerify };
