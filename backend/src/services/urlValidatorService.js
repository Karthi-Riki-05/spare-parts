const { logger } = require('../utils/logger');

async function validateUrl(url) {
  if (!url || url.trim() === '') return { status: 'broken', finalUrl: null };
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (res.status === 200) return { status: 'valid', finalUrl: url };
    if (res.status >= 300 && res.status < 400) return { status: 'redirected', finalUrl: res.headers.get('location') || url };
    logger.info(`[URL VALIDATOR] URL check returned status ${res.status} — keeping URL: ${url}`);
    return { status: 'unverified', finalUrl: url };
  } catch {
    logger.info(`[URL VALIDATOR] URL timeout or error — keeping URL as unverified: ${url}`);
    return { status: 'unverified', finalUrl: url };
  }
}

async function validateBatch(urls) {
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(5);
  return Promise.all(urls.map(url => limit(() => validateUrl(url))));
}

module.exports = { validateUrl, validateBatch };
