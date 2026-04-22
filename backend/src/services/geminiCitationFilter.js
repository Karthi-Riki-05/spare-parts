/**
 * Citation-based URL filter for Gemini 2.5 with googleSearch grounding.
 *
 * Gemini frequently hallucinates product URLs — it constructs plausible paths
 * on real manufacturer domains even when the search result didn't contain
 * that specific page. The grounding metadata on the API response tells us
 * which sources Gemini actually retrieved; this module uses that to either
 * confirm, replace, or reject the model-authored website_id.
 *
 * Enforcement has three levels (Step 2 of implementation adds Level A only;
 * resolver exists for Steps 3–4 but isn't called yet):
 *
 *   Level A (free) — domain gate.
 *     The model's URL host must appear among groundingChunks[*].web.title
 *     domains. If no citation shares the domain → reject immediately.
 *
 *   Level B (adds ~200–500ms) — path match after redirect resolve.
 *   Level C — replace model URL with a resolved citation URL on same domain.
 */

const { logger } = require('../utils/logger');

// Validation-status labels used by the citation filter. These sit alongside
// the runtime url_validation_status values produced by urlValidatorService.
const URL_VALIDATION_STATUS = {
  CITATION_CONFIRMED:     'citation_confirmed',
  CITATION_PARTIAL:       'citation_partial',
  CITATION_REPLACED:      'citation_replaced',
  NO_CITATIONS:           'no_citations',
  NO_CITATIONS_FALLBACK:  'no_citations_fallback',
  DOMAIN_NOT_CITED:       'domain_not_cited',
  BOT_BLOCKED_TRUSTED:    'bot_blocked_trusted',
  BOT_BLOCKED_UNTRUSTED:  'bot_blocked_untrusted',
};

// Trusted manufacturer / distributor apex domains. A 403 from any of these
// means "anti-bot protection" (URL is trusted). A 403 from anything else
// means "we can't tell if the page exists" (URL is suspicious).
const TRUSTED_DOMAINS = new Set([
  // Electronic components distributors
  'mouser.com', 'digikey.com', 'rs-online.com', 'farnell.com',
  // Bearings
  'skf.com',
  // PLC / automation
  'siemens.com', 'abb.com', 'ifm.com', 'festo.com', 'balluff.com',
  'turck.com', 'boschrexroth.com', 'sew-eurodrive.com', 'atlascopco.com',
  // Sensors / hydraulics
  'hydac.com', 'phoenixcontact.com', 'pepperl-fuchs.com',
  'grundfos.com', 'danfoss.com', 'endress.com', 'wika.com',
  'omron.com', 'keyence.com', 'sick.com',
  // Cables / connectors / enclosures
  'lapp.com', 'legrand.com', 'eaton.com', 'rittal.com', 'wago.com',
  'murrelektronik.com',
  // Indian manufacturers
  'kirloskarelectric.com', 'lntebg.com', 'havells.com',
  'bharatbijlee.com', 'crompton.co.in',
  // Schneider
  'schneider-electric.com', 'se.com',
]);

function isTrustedDomain(urlStr) {
  const host = safeHost(urlStr);
  const apex = apexDomain(host);
  return TRUSTED_DOMAINS.has(apex);
}

/**
 * Normalize a hostname for comparison: lowercase, strip leading "www.".
 */
function normalizeDomain(host) {
  if (!host) return '';
  return String(host).toLowerCase().replace(/^www\./, '');
}

/**
 * Extract the registrable apex (second-level + TLD) from a host. This keeps
 * "hydac.com" == "se.hydac.com" == "www.hydac.com", but does not try to be
 * a full PSL implementation — good enough for manufacturer/distributor URLs.
 */
function apexDomain(host) {
  const norm = normalizeDomain(host);
  if (!norm) return '';
  const parts = norm.split('.');
  if (parts.length <= 2) return norm;

  // Handle common two-part ccTLDs (co.in, co.uk, com.au, co.jp).
  const last2 = parts.slice(-2).join('.');
  const secondLevel = parts[parts.length - 2];
  const twoPartTlds = new Set(['co.in', 'co.uk', 'com.au', 'co.jp', 'co.nz', 'com.br', 'co.za']);
  if (twoPartTlds.has(last2) || (secondLevel === 'co' || secondLevel === 'com' || secondLevel === 'gov')) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function safeHost(urlStr) {
  try { return new URL(urlStr).host; } catch { return ''; }
}

/**
 * Pull citation info from a Gemini SDK response. Shape (as of 2026-04):
 *   response.candidates[0].groundingMetadata.groundingChunks[i].web.{uri,title}
 *
 * `uri` is always a vertexaisearch.cloud.google.com redirect URL — the real
 * source URL is only knowable after HTTP-resolving that redirect (Level B).
 * `title` is the plain source domain ("hydac.com", "mouser.com") and is
 * what we use for the Level A gate.
 */
function extractCitations(response) {
  const titleDomains = new Set();
  const redirectUris = [];
  try {
    const cand = response && response.candidates && response.candidates[0];
    const gm = cand && cand.groundingMetadata;
    const chunks = (gm && gm.groundingChunks) || [];
    for (const c of chunks) {
      const web = c && c.web;
      if (!web) continue;
      if (web.title) {
        const host = web.title.includes('/') ? safeHost('https://' + web.title) : web.title;
        const apex = apexDomain(host);
        if (apex) titleDomains.add(apex);
      }
      if (web.uri) redirectUris.push(web.uri);
    }
  } catch (err) {
    logger.warn(`[CITATIONS] extract failed: ${err.message}`);
  }
  return { titleDomains, redirectUris };
}

/**
 * Level A — free domain gate.
 *
 * Returns:
 *   { pass: true }                                     → model URL host matches
 *                                                        at least one citation title
 *   { pass: false, reason: 'no_citations' }            → the response had zero citations
 *   { pass: false, reason: 'domain_not_cited', ... }   → citations exist but on other domains
 */
function levelADomainGate(modelUrl, titleDomains) {
  if (!modelUrl) return { pass: false, reason: 'empty_url' };

  const host = safeHost(modelUrl);
  if (!host) return { pass: false, reason: 'invalid_url' };

  if (!titleDomains || titleDomains.size === 0) {
    return { pass: false, reason: URL_VALIDATION_STATUS.NO_CITATIONS };
  }

  const modelApex = apexDomain(host);
  if (titleDomains.has(modelApex)) return { pass: true };

  return {
    pass: false,
    reason: URL_VALIDATION_STATUS.DOMAIN_NOT_CITED,
    modelApex,
    citedDomains: Array.from(titleDomains),
  };
}

/**
 * Resolve one vertexaisearch.cloud.google.com/grounding-api-redirect/... URL
 * to the real source URL by following the redirect. Used by Level B/C in the
 * next implementation step; not called from the current pipeline yet.
 */
async function resolveCitationUri(redirectUri, timeoutMs = 8000) {
  if (!redirectUri) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(redirectUri, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/120.0.0.0 Safari/537.36',
      },
    });
    return res.url || null;
  } catch (err) {
    logger.info(`[CITATIONS] resolve failed: ${err?.message || 'unknown'}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve many redirect URIs in parallel (p-limit=5, no cache).
 */
async function resolveCitations(redirectUris) {
  if (!redirectUris || redirectUris.length === 0) return [];
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(5);
  const resolved = await Promise.all(
    redirectUris.map(uri => limit(() => resolveCitationUri(uri))),
  );
  return resolved.filter(Boolean);
}

function safeUrl(urlStr) {
  try { return new URL(urlStr); } catch { return null; }
}

/**
 * Level B — path match.
 *
 * Given the model's URL and a list of resolved citation URLs on the same
 * apex, decide whether the AI-authored path is trustworthy.
 *
 *   Exact URL match ................ citation_confirmed (keep AI score)
 *   Path prefix overlap either way .. citation_partial   (cap score ≤85)
 *   No path overlap ................. pass to Level C    (replace)
 */
function levelBPathMatch(modelUrl, resolvedUrls) {
  const mu = safeUrl(modelUrl);
  if (!mu) return { match: 'none' };

  const modelApex = apexDomain(mu.host);
  const modelPath = mu.pathname.replace(/\/+$/, '') || '/';

  const sameApex = resolvedUrls
    .map(u => safeUrl(u))
    .filter(u => u && apexDomain(u.host) === modelApex);

  if (sameApex.length === 0) return { match: 'none' };

  for (const cu of sameApex) {
    if (cu.href === mu.href) {
      return { match: 'exact', citationUrl: cu.href };
    }
  }

  for (const cu of sameApex) {
    const cPath = cu.pathname.replace(/\/+$/, '') || '/';
    if (cPath === modelPath) {
      return { match: 'exact', citationUrl: cu.href };
    }
    if (modelPath.startsWith(cPath + '/') || cPath.startsWith(modelPath + '/')) {
      return { match: 'partial', citationUrl: cu.href };
    }
  }

  // Same domain cited but different path entirely → Level C will replace.
  return { match: 'domain_only', citationUrl: sameApex[0].href };
}

/**
 * Top-level orchestrator — runs Level A, Level B, Level C in order and
 * returns a single decision for the caller.
 *
 * Returns:
 *   { action: 'keep', status, url }
 *   { action: 'replace', status, url, scoreCap }
 *   { action: 'fallback', status, url, scoreCap }   // URL kept, HTTP check later
 *   { action: 'reject', status }                     // URL cleared
 */
async function applyCitationFilter(response, modelUrl) {
  if (!modelUrl) {
    return { action: 'reject', status: URL_VALIDATION_STATUS.DOMAIN_NOT_CITED };
  }

  const { titleDomains, redirectUris } = extractCitations(response);
  const gateA = levelADomainGate(modelUrl, titleDomains);

  if (gateA.pass === false) {
    if (gateA.reason === URL_VALIDATION_STATUS.NO_CITATIONS) {
      // Option 2: no citations at all is weak evidence of hallucination, so
      // keep the URL but cap score — the downstream HTTP validator will give
      // the final verdict.
      return {
        action: 'fallback',
        status: URL_VALIDATION_STATUS.NO_CITATIONS_FALLBACK,
        url: modelUrl,
        scoreCap: 60,
      };
    }
    // domain_not_cited: citations exist but on other domains — strong
    // hallucination signal. Hard reject.
    return {
      action: 'reject',
      status: URL_VALIDATION_STATUS.DOMAIN_NOT_CITED,
      citedDomains: gateA.citedDomains,
    };
  }

  // Level A passed — same apex is cited. Resolve redirects to compare paths.
  const resolvedUrls = await resolveCitations(redirectUris);
  if (resolvedUrls.length === 0) {
    // All redirect resolutions failed (Google redirects throttled, timeouts).
    // Treat as path-unknown same-apex — keep URL, cap at 85.
    logger.info('[CITATIONS] all redirect resolutions failed — partial status');
    return {
      action: 'keep',
      status: URL_VALIDATION_STATUS.CITATION_PARTIAL,
      url: modelUrl,
      scoreCap: 85,
    };
  }

  const pathMatch = levelBPathMatch(modelUrl, resolvedUrls);

  if (pathMatch.match === 'exact') {
    return {
      action: 'keep',
      status: URL_VALIDATION_STATUS.CITATION_CONFIRMED,
      url: modelUrl,
      // No score cap — keep AI score as-is.
    };
  }

  if (pathMatch.match === 'partial') {
    return {
      action: 'keep',
      status: URL_VALIDATION_STATUS.CITATION_PARTIAL,
      url: modelUrl,
      scoreCap: 85,
    };
  }

  if (pathMatch.match === 'domain_only') {
    // Level C — replace model path with the resolved citation URL.
    return {
      action: 'replace',
      status: URL_VALIDATION_STATUS.CITATION_REPLACED,
      url: pathMatch.citationUrl,
      scoreCap: 75,
    };
  }

  // Apex cited but nothing resolved on that apex. Shouldn't normally happen
  // (title apex = URL apex by A's guarantee). Fall through as partial.
  return {
    action: 'keep',
    status: URL_VALIDATION_STATUS.CITATION_PARTIAL,
    url: modelUrl,
    scoreCap: 85,
  };
}

module.exports = {
  URL_VALIDATION_STATUS,
  TRUSTED_DOMAINS,
  isTrustedDomain,
  normalizeDomain,
  apexDomain,
  extractCitations,
  levelADomainGate,
  levelBPathMatch,
  resolveCitationUri,
  resolveCitations,
  applyCitationFilter,
};
