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

const VALIDATION_STATUS = {
  CONFIRMED:    'confirmed',     // 2xx / 3xx → real page
  BOT_BLOCKED:  'bot_blocked',   // 401/403/other 4xx (not 404/410) → page exists, server blocked
  UNVERIFIED:   'unverified',    // 5xx / timeout / network → keep URL, cap score
  BROKEN_404:   'broken_404',    // 404 / 410 → clear URL
  BROKEN_ERROR: 'broken_error',  // invalid URL / redirect to error page → clear URL
};

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

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

async function fetchWithTimeout(url, method, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: BROWSER_HEADERS,
    });
  } finally {
    clearTimeout(timer);
  }
}

function classifyResponse(res, raw) {
  const finalUrl = res.url || raw;
  const redirected = !!res.redirected && finalUrl !== raw;

  if (pathMatchesErrorPattern(finalUrl)) {
    logger.warn(`[URL VALIDATOR] REJECTED redirect_to_error: ${raw} → ${finalUrl}`);
    return {
      valid: false,
      keep_url: false,
      status: 'broken',
      validation_status: VALIDATION_STATUS.BROKEN_ERROR,
      finalUrl: null,
      reason: 'redirect_to_error',
      httpStatus: res.status,
    };
  }

  if (res.status === 404 || res.status === 410) {
    logger.warn(`[URL VALIDATOR] REJECTED http_${res.status}: ${raw}`);
    return {
      valid: false,
      keep_url: false,
      status: 'broken',
      validation_status: VALIDATION_STATUS.BROKEN_404,
      finalUrl: null,
      reason: res.status === 404 ? '404_not_found' : '410_gone',
      httpStatus: res.status,
    };
  }

  if (res.status >= 200 && res.status < 400) {
    if (redirected) {
      logger.info(`[URL VALIDATOR] Redirected: ${raw} → ${finalUrl}`);
      return {
        valid: true,
        keep_url: true,
        status: 'redirected',
        validation_status: VALIDATION_STATUS.CONFIRMED,
        finalUrl,
        httpStatus: res.status,
      };
    }
    return {
      valid: true,
      keep_url: true,
      status: 'valid',
      validation_status: VALIDATION_STATUS.CONFIRMED,
      finalUrl,
      httpStatus: res.status,
    };
  }

  // 401 / 403 / 405 / 406 / any other 4xx (not 404/410): page exists, server
  // blocked our request. Classic anti-bot protection on manufacturer sites.
  if (res.status >= 400 && res.status < 500) {
    logger.info(`[URL VALIDATOR] BOT_BLOCKED http_${res.status} — keeping URL: ${raw}`);
    return {
      valid: true,
      keep_url: true,
      status: 'bot_blocked',
      validation_status: VALIDATION_STATUS.BOT_BLOCKED,
      finalUrl: raw,
      reason: `http_${res.status}`,
      httpStatus: res.status,
    };
  }

  // 5xx: server error — keep URL, treat as unverified.
  logger.info(`[URL VALIDATOR] UNVERIFIED http_${res.status} — keeping URL: ${raw}`);
  return {
    valid: true,
    keep_url: true,
    status: 'unverified',
    validation_status: VALIDATION_STATUS.UNVERIFIED,
    finalUrl: raw,
    reason: `http_${res.status}`,
    httpStatus: res.status,
  };
}

async function validateUrl(url) {
  if (!url || String(url).trim() === '') {
    return {
      valid: false, keep_url: false,
      status: 'broken', validation_status: VALIDATION_STATUS.BROKEN_ERROR,
      finalUrl: null, reason: 'empty',
    };
  }

  const raw = String(url).trim();

  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    logger.warn(`[URL VALIDATOR] REJECTED relative_url: ${raw}`);
    return {
      valid: false, keep_url: false,
      status: 'broken', validation_status: VALIDATION_STATUS.BROKEN_ERROR,
      finalUrl: null, reason: 'relative_url',
    };
  }
  try { new URL(raw); } catch {
    logger.warn(`[URL VALIDATOR] REJECTED invalid_url: ${raw}`);
    return {
      valid: false, keep_url: false,
      status: 'broken', validation_status: VALIDATION_STATUS.BROKEN_ERROR,
      finalUrl: null, reason: 'invalid_url',
    };
  }
  if (pathMatchesErrorPattern(raw)) {
    logger.warn(`[URL VALIDATOR] REJECTED error_page: ${raw}`);
    return {
      valid: false, keep_url: false,
      status: 'broken', validation_status: VALIDATION_STATUS.BROKEN_ERROR,
      finalUrl: null, reason: 'error_page',
    };
  }

  // GET first — more reliable; most sites accept GET even when HEAD is blocked.
  try {
    const res = await fetchWithTimeout(raw, 'GET', 15000);
    return classifyResponse(res, raw);
  } catch (getErr) {
    // Network/timeout on GET — fall back to HEAD. Some servers refuse GET
    // from unknown user agents but still respond to HEAD.
    try {
      const res = await fetchWithTimeout(raw, 'HEAD', 10000);
      return classifyResponse(res, raw);
    } catch (headErr) {
      logger.info(
        `[URL VALIDATOR] UNVERIFIED network/timeout — keeping URL: ${raw} ` +
        `(get=${getErr?.message || 'unknown'} head=${headErr?.message || 'unknown'})`
      );
      return {
        valid: true,
        keep_url: true,
        status: 'unverified',
        validation_status: VALIDATION_STATUS.UNVERIFIED,
        finalUrl: raw,
        reason: 'timeout_kept',
      };
    }
  }
}

async function validateBatch(urls) {
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(5);
  return Promise.all(urls.map(url => limit(() => validateUrl(url))));
}

module.exports = { validateUrl, validateBatch, VALIDATION_STATUS };
