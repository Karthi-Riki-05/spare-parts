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
    const limit = pLimit(config.maxConcurrency);
    const actualBatchSize = batchSize || config.batchSize;
    const correlationId = req.correlationId;

    logger.info('Starting verification', { correlationId, rowCount: rows.length });

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

    const ROW_HARD_TIMEOUT_MS = 45000;
    const withRowTimeout = (promise, rowIndex) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(
        () => reject(Object.assign(new Error('Row hard timeout (45s)'), { __rowTimeout: true, rowIndex })),
        ROW_HARD_TIMEOUT_MS,
      )),
    ]);

    const tasks = rows.map(row => limit(async () => {
      if (res.destroyed) return;
      const deduped = applyAllDeduplication(row);
      const internalItemNumber = deduped.internalItemNumber;
      // Pass full row object so cache key uses all available fields
      const cacheKey = cacheService.makeCacheKey(deduped);
      const cached = cacheService.get(cacheKey);
      if (cached) {
        cacheHits++;
        completed++;
        logger.info(`[WEB VERIFY] Row ${correlationId} → CACHE HIT (no API call)`);
        const result = { ...cached, rowIndex: row.rowIndex, internalItemNumber };
        results.push(result);
        send({ type: 'row_complete', result });
        send({ type: 'progress', batch: Math.ceil(completed / actualBatchSize), totalBatches, completed, total, elapsedSeconds: Math.round((Date.now() - startTime) / 1000) });
        return;
      }
      try {
        if (config.geminiMockMode) mockCalls++; else geminiCalls++;
        let result = await withRowTimeout((async () => {
          let r = await verifyRow(deduped, false, correlationId);
          if (r.verificationScore < 70 && deduped.supplementary.trim()) {
            const suppType = classifySupplementary(deduped.supplementary);
            if (suppType === 'part_specification') {
              if (config.geminiMockMode) mockCalls++; else geminiCalls++;
              r = await verifyRow(deduped, true, correlationId);
              r.supplementaryUsed = true;
            }
          }
          // Req 4: if Manufacturer is still empty, force rule-enforce fallback to infer it
          const needsManufacturerInference = !r.manufacturer || !r.manufacturer.trim();
          if (r.verificationScore < 70 || needsManufacturerInference) {
            if (config.claudeMockMode) mockCalls++; else fallbackCalls++;
            r = await enforceRules(deduped, r, correlationId);
          }
          return r;
        })(), row.rowIndex);
        // URL validation note: if URL was unreachable, AI's score/source_type still stand
        if (result.urlValidationStatus === 'broken' || result.urlValidationStatus === 'timeout') {
          logger.info(`[VERIFY] Row ${correlationId} → URL validation failed (${result.urlValidationStatus}) but score=${result.verificationScore} kept. Part was confirmed by AI, URL unreachable.`);
        }
        // Block score/source_type inconsistency from reaching frontend
        if (result.verificationScore >= 70 && result.sourceType === 'not_found') {
          const vs = (result.verifiedSource || '').toLowerCase();
          let newSourceType;
          if (vs.includes('manufacturer')) newSourceType = 'official';
          else if (vs.includes('distributor') || vs.includes('store') || vs.includes('reseller')) newSourceType = 'distributor';
          else newSourceType = 'unknown';
          logger.info(`[VERIFY] Row ${correlationId} → source_type corrected from not_found to ${newSourceType} based on verified_source`);
          result.sourceType = newSourceType;
        }
        result = deduplicateVerified(result);
        // Req 2b: keep verified C/D layout aligned with the original input
        result = mirrorOriginalLayout(result, deduped);
        result.rowIndex = row.rowIndex;
        result.internalItemNumber = internalItemNumber;
        if (result.supplementaryChanged && result.supplementaryOriginal !== result.supplementary) {
          changeLogs.push(createChangeLog(row.rowIndex, result.supplementaryOriginal, result.supplementary, result.verificationScore, result.verificationScore < 70 ? 'claude-sonnet-4-6' : 'gemini-2.5-flash'));
        }
        cacheService.set(cacheKey, result);
        results.push(result);
        completed++;
        send({ type: 'row_complete', result });
        send({ type: 'progress', batch: Math.ceil(completed / actualBatchSize), totalBatches, completed, total, elapsedSeconds: Math.round((Date.now() - startTime) / 1000) });
      } catch (error) {
        completed++;
        if (error && error.__rowTimeout) {
          // Hard 45s timeout — return a placeholder result so the queue keeps moving
          logger.warn(`[VERIFY] Row ${correlationId} → row ${row.rowIndex} hit 45s hard timeout, marking timeout and continuing`);
          const timeoutResult = {
            rowIndex: row.rowIndex,
            internalItemNumber,
            description: deduped.description || '',
            manufacturer: deduped.manufacturer || '',
            itemNumber: deduped.itemNumber || '',
            typeDesignation: deduped.typeDesignation || '',
            supplementary: deduped.supplementary || '',
            verifiedSource: 'Verification timed out',
            verificationScore: 0,
            websiteId: '',
            sourceType: 'timeout',
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

    // Cache collision detection — if >80% of rows have identical descriptions, something is wrong
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
      ` Total time           : ${totalMs}ms`,
      '─────────────────────────────────────────',
    ];
    for (const l of summary) logger.info(l);

    send({ type: 'complete', response: { results, changeLogs, stats: computeStats(results), cacheHits } });
    res.end();
  } catch (error) { next(error); }
}

module.exports = { handleVerify };
