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
    const { rows, batchSize, originalHeaders } = req.body;
    const correlationId = req.correlationId;
    const actualBatchSize = batchSize || config.batchSize;
    const startTime = Date.now();

    logger.info('Starting SSE verification', { correlationId, rowCount: rows.length });

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write('data: {"type":"ping"}\n\n'); }, 15000);
    const send = (event) => { if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); };

    let aborted = false;
    req.on('close', () => { aborted = true; clearInterval(heartbeat); });

    await require('../services/verificationService').processRows(rows, {
      correlationId,
      batchSize: actualBatchSize,
      originalHeaders: originalHeaders || null,
      onProgress: (p) => {
        if (aborted || res.destroyed) return;
        send({ 
          type: 'progress', 
          ...p,
          totalBatches: Math.ceil(p.total / actualBatchSize)
        });
      },
      onRowComplete: (result) => {
        if (aborted || res.destroyed) return;
        send({ type: 'row_complete', result });
      },
      onError: (err) => {
        if (aborted || res.destroyed) return;
        send({ type: 'error', ...err });
      },
      onComplete: (summary) => {
        if (aborted || res.destroyed) return;
        send({ type: 'complete', response: { results: summary.results, changeLogs: summary.changeLogs, stats: summary.stats, cacheHits: summary.cacheHits } });
        res.end();
      }
    });

    clearInterval(heartbeat);
  } catch (error) { 
    clearInterval(heartbeat);
    next(error); 
  }
}

module.exports = { handleVerify };
