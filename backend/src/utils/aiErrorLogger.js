const { logger } = require('./logger');

function classifyAiError(error) {
  const msg = (error && (error.message || String(error))) || '';
  if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
    return { kind: 'QUOTA', short: 'AI NOT WORKING — Gemini quota exceeded / billing not enabled' };
  }
  if (/401|API key not valid|API_KEY_INVALID|PERMISSION_DENIED|403/i.test(msg)) {
    return { kind: 'AUTH', short: 'AI NOT WORKING — Gemini API key invalid or unauthorized' };
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(msg)) {
    return { kind: 'NETWORK', short: 'AI NOT WORKING — network failure reaching Gemini' };
  }
  if (/No JSON found|Empty response/i.test(msg)) {
    return { kind: 'PARSE', short: 'AI NOT WORKING — Gemini returned unparseable response' };
  }
  return { kind: 'UNKNOWN', short: 'AI NOT WORKING — unknown error' };
}

function logAiError(stage, correlationId, error) {
  const { kind, short } = classifyAiError(error);
  logger.error(`[${stage}] Row ${correlationId} → ${short} (${kind})`);
  logger.error(`[${stage}] Row ${correlationId} → raw: ${(error.message || String(error)).split('\n')[0].slice(0, 300)}`);
}

module.exports = { classifyAiError, logAiError };
