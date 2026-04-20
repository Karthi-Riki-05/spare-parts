const { logger } = require('../utils/logger');

// Error / auth / unavailable page patterns that must never count as a product page.
const ERROR_PATH_PATTERNS = [
  '/error',
  '/errorpage',
  '/404',
  '/not-found',
  '/page-not-found',
  '/login',
  '/signin',
  '/access-denied',
  '/forbidden',
  '/unavailable',
];

function pathMatchesErrorPattern(urlStr) {
  try {
    const p = new URL(urlStr).pathname.toLowerCase();
    return ERROR_PATH_PATTERNS.some(pat =>
      p === pat || p.startsWith(pat + '/') || p.endsWith(pat)
    );
  } catch {
    return false;
  }
}

function reject(reason, url) {
  logger.warn(`[URL VALIDATOR] REJECTED ${reason}: ${url}`);
  return { status: 'broken', finalUrl: null, reason };
}

async function validateUrl(url) {
  if (!url || String(url).trim() === '') {
    return { status: 'broken', finalUrl: null, reason: 'empty' };
  }
  const raw = String(url).trim();

  // Block relative URLs up front — never hit fetch() with them.
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return reject('relative_url', raw);
  }

  // Sanity-parse + block known error-page paths before any network call.
  try {
    new URL(raw);
  } catch {
    return reject('invalid_url', raw);
  }
  if (pathMatchesErrorPattern(raw)) {
    return reject('error_page', raw);
  }

  try {
    const res = await fetch(raw, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SparePartsBot/1.0)',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') || raw;
      // Resolve relative redirects against the original URL so we always end up absolute.
      let finalUrl;
      try {
        finalUrl = new URL(location, raw).toString();
      } catch {
        return reject('redirect_invalid', raw);
      }
      if (pathMatchesErrorPattern(finalUrl)) {
        logger.warn(`[URL VALIDATOR] REJECTED redirect_to_error: ${raw} → ${finalUrl}`);
        return { status: 'broken', finalUrl: null, reason: 'redirect_to_error' };
      }
      logger.info(`[URL VALIDATOR] Redirected: ${raw} → ${finalUrl}`);
      return { status: 'redirected', finalUrl };
    }

    if (res.status === 200) {
      return { status: 'valid', finalUrl: raw };
    }

    // 404 is a hard reject — the AI claimed a product page that does not exist.
    // Callers use this to clear websiteId AND cap the score (see verificationService).
    if (res.status === 404) {
      logger.warn(`[URL VALIDATOR] REJECTED 404_not_found: ${raw}`);
      return { status: 'broken', finalUrl: null, reason: '404_not_found' };
    }

    // Other 4xx/5xx: keep-but-flag so we don't drop legitimate URLs behind
    // auth walls / rate limits (common on manufacturer sites that throttle HEAD).
    logger.info(`[URL VALIDATOR] Non-200 status=${res.status} — keeping as unverified: ${raw}`);
    return { status: 'unverified', finalUrl: raw, httpStatus: res.status };
  } catch (err) {
    // Timeout / network — per rule, keep the URL (false negatives on slow sites
    // are worse than accepting an unverified URL the user can eyeball).
    logger.info(`[URL VALIDATOR] Network/timeout — keeping as unverified: ${raw} (${err?.message || 'unknown'})`);
    return { status: 'unverified', finalUrl: raw, reason: 'timeout_kept' };
  }
}

async function validateBatch(urls) {
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(5);
  return Promise.all(urls.map(url => limit(() => validateUrl(url))));
}

module.exports = { validateUrl, validateBatch };
