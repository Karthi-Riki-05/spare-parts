const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config');
const { withRetry } = require('../utils/retry');
const { logger } = require('../utils/logger');
const { logAiError } = require('../utils/aiErrorLogger');
const { validateUrl } = require('./urlValidatorService');
const { mockVerificationResult } = require('./mocks/geminiMock');

let genAI = null;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(config.geminiApiKey);
  return genAI;
}

function buildPrompt(row, useSupplementary) {
  let partInfo = `- Description: ${row.description || 'empty'}\n- Manufacturer: ${row.manufacturer || 'empty'}\n- Item Number: ${row.itemNumber || 'empty'}\n- Type Designation: ${row.typeDesignation || 'empty'}`;
  if (useSupplementary && row.supplementary) {
    partInfo += `\n- Supplementary Info: ${row.supplementary}`;
  }
  // Swedish translation and ERS. handling are done at normalization step
  return `You are verifying industrial spare parts data. Search the web to confirm this part exists and find its official product page.\n\nPart to verify:\n${partInfo}\n\nSEARCH SEQUENCE:\n1. Search "[Manufacturer] [Item Number]" on manufacturer's official website\n2. If not found: search on Octopart, then Mouser, then RS Online, then PLCHardware\n3. Confirm the exact part number appears on the page\n\nMANDATORY RULES:\n- IF MANUFACTURER IS EMPTY — USE THIS EXACT SEQUENCE:\n  STEP 1 — Check Type Designation prefix:\n    1LA, 1FT, 1FK, 1PH, 6ES7, 6SL3, 6SE7, 6GK, 6RA, SIMATIC, SINAMICS, SINUMERIK → Siemens\n    MKD, MHD, HCS, HDS, R911, MSK, LSF                                          → Bosch Rexroth / Indramat\n    MM0, MLU, MDX, DRS, R77, KA, WA, FA                                          → SEW-Eurodrive\n    LR, OGE, OGH, OGS, OU, OF, SI                                                → IFM Electronic\n    SMT, VADMI, ADNGF, DNC, DSNU, FESTO                                          → Festo\n    BOS, BAM, BTL, BES, BCC                                                      → Balluff\n    NI, BI, BIM, QS, PS                                                          → Turck\n    QST, LTV, ZT, RT                                                             → Atlas Copco\n    62, 63, 22, 23, 32, 33 (bearing nums)                                        → SKF\n    VR, EDS, VM, HDA, HFT                                                        → Hydac\n  STEP 2 — Check Item Number pattern:\n    Starts with R9 followed by 6+ digits  → Bosch Rexroth\n    8-digit number starting 18 or 82      → SEW-Eurodrive\n    Starts with 6ES, 6SL, 6SE, 6GK         → Siemens\n    Starts with H followed by 7 digits     → Hydac\n  STEP 3 — Check Description for brand keywords:\n    Contains SIMATIC, SINAMICS, SINUMERIK, SIMODRIVE  → Siemens\n    Contains MOVIMOT, MOVIDRIVE, MOVITRAC, MOVIAXIS   → SEW-Eurodrive\n    Contains REXROTH, INDRAMAT                        → Bosch Rexroth\n    Contains FESTO (any case)                         → Festo\n    Contains HYDAC (any case)                         → Hydac\n  STEP 4 — Web search using all 3 fields combined:\n    Search 1: "[typeDesignation] manufacturer datasheet"\n    Search 2: "[itemNumber] industrial spare part brand"\n    Search 3: "[description] [typeDesignation] official"\n    Extract manufacturer from search results\n  STEP 5 — Only leave manufacturer blank if ALL 4 steps above fail to identify any manufacturer. Set manufacturer_inferred: true when inferred.\n- If item_number == type_designation: keep only item_number\n- Fill empty fields ONLY with data confirmed on a real webpage\n\nSCORING (verification_score is an INTEGER 0-100):\n- 90-100: exact part confirmed on official manufacturer page with matching item number\n- 70-89:  exact part confirmed on a major distributor (Mouser/RS/Octopart/PLCHardware)\n- 50-69:  similar/related part found, partial match only\n- 0-49:   not found or only generic results\nNEVER return 0 or 1 unless the part is genuinely unfindable.\n\nMANDATORY URL RULES:\n- website_id MUST be the direct product page URL\n- NEVER use these domains as website_id: indiamart.com, alibaba.com, aliexpress.com, amazon.com, ebay.com, made-in-china.com, tradeindia.com, exportersindia.com\n- If official manufacturer URL found but slow to load → still include it in website_id\n- PDF datasheets are acceptable only if no product page exists\n\nSOURCE TYPE RULES (follow exactly):\n- source_type = "official"    → website_id is on manufacturer's own domain\n- source_type = "distributor" → website_id is on Mouser/RS/Octopart/PLCHardware or any reseller\n- source_type = "not_found"   → website_id empty, part not confirmed anywhere\n- source_type = "unknown"     → score < 50 only\n\nSCORE AND SOURCE_TYPE MUST BE CONSISTENT:\n- score 90-100 → source_type MUST be "official"\n- score 70-89  → source_type MUST be "distributor"\n- score 50-69  → source_type = "distributor" or "unknown"\n- score < 50   → source_type = "not_found" or "unknown"\nNEVER return score 90+ with source_type "not_found"\n\nRespond ONLY with a single JSON object, no markdown fences, no prose:\n{"description":"","manufacturer":"","item_number":"","type_designation":"","supplementary":"","verified_source":"Manufacturer website","verification_score":0,"website_id":"","source_type":"official","manufacturer_website":"","manufacturer_inferred":false,"supplementary_used":${useSupplementary},"supplementary_changed":false,"supplementary_original":"","supplementary_type":"unknown"}`;
}

function tryParseObjectContaining(text, requiredKey) {
  // Find every {...} candidate (greedy, balanced via lastIndexOf scan) that contains requiredKey
  let i = 0;
  const matches = [];
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open === -1) break;
    // Find matching close brace by simple depth counting
    let depth = 0;
    let close = -1;
    for (let j = open; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') {
        depth--;
        if (depth === 0) { close = j; break; }
      }
    }
    if (close === -1) break;
    const candidate = text.slice(open, close + 1);
    if (!requiredKey || candidate.includes(requiredKey)) matches.push(candidate);
    i = close + 1;
  }
  // Try the LAST candidate first (Gemini often puts JSON after prose)
  for (let k = matches.length - 1; k >= 0; k--) {
    try { return JSON.parse(matches[k]); } catch { /* try next */ }
  }
  return null;
}

function extractVerifyJson(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  // Step 1: full text parse
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  // Step 2: last {...} block
  const lastOpen = cleaned.lastIndexOf('{');
  const lastClose = cleaned.lastIndexOf('}');
  if (lastOpen !== -1 && lastClose > lastOpen) {
    try { return JSON.parse(cleaned.slice(lastOpen, lastClose + 1)); } catch { /* fall through */ }
  }
  // Step 3: object containing "verification_score"
  const byScore = tryParseObjectContaining(cleaned, 'verification_score');
  if (byScore) return byScore;
  // Step 4: object containing "source_type"
  const bySource = tryParseObjectContaining(cleaned, 'source_type');
  if (bySource) return bySource;
  return null;
}

function safeDefaultRaw(row, useSupplementary) {
  return {
    description: row.description || '',
    manufacturer: row.manufacturer || '',
    item_number: row.itemNumber || '',
    type_designation: row.typeDesignation || '',
    supplementary: row.supplementary || '',
    verified_source: 'Parse error - manual review needed',
    verification_score: 0,
    website_id: '',
    source_type: 'unknown',
    manufacturer_website: '',
    manufacturer_inferred: false,
    supplementary_used: useSupplementary,
    supplementary_changed: false,
    supplementary_original: '',
    supplementary_type: 'unknown',
  };
}

function mapResult(raw, rowIndex) {
  return {
    rowIndex, internalItemNumber: '',
    description: raw.description || '', manufacturer: raw.manufacturer || '',
    itemNumber: raw.item_number || '', typeDesignation: raw.type_designation || '',
    supplementary: raw.supplementary || '',
    verifiedSource: raw.verified_source || 'Not found',
    verificationScore: raw.verification_score || 0,
    websiteId: raw.website_id || '',
    sourceType: raw.source_type || 'not_found',
    manufacturerWebsite: raw.manufacturer_website || '',
    manufacturerInferred: raw.manufacturer_inferred || false,
    supplementaryUsed: raw.supplementary_used || false,
    supplementaryChanged: raw.supplementary_changed || false,
    supplementaryOriginal: raw.supplementary_original || '',
    supplementaryType: raw.supplementary_type || 'unknown',
    urlValidationStatus: 'unchecked',
  };
}

async function verifyRow(row, useSupplementary, correlationId) {
  if (config.geminiMockMode) {
    logger.warn(`[WEB VERIFY] Row ${correlationId} → MOCK MODE (no real API call)`);
    return mockVerificationResult(row.rowIndex, row);
  }
  logger.info(`[WEB VERIFY] Row ${correlationId} → calling Gemini 2.5-flash with Google Search (real API)`);

  return withRetry(async () => {
    const start = Date.now();
    try {
      const prompt = buildPrompt(row, useSupplementary);
      const model = getClient().getGenerativeModel({
        model: 'gemini-2.5-flash',
        tools: [{ googleSearch: {} }],
      });
      const genResult = await model.generateContent(prompt);
      const text = genResult.response.text();
      let parsed = extractVerifyJson(text);
      if (!parsed) {
        logger.warn(`[WEB VERIFY] Row ${correlationId} → JSON parse failed after 4 attempts, returning safe default`);
        parsed = safeDefaultRaw(row, useSupplementary);
      }

      let result = mapResult(parsed, row.rowIndex);

      if (result.websiteId) {
        const urlCheck = await validateUrl(result.websiteId);
        result.urlValidationStatus = urlCheck.status;
        if (urlCheck.status === 'broken') {
          // 4xx/5xx — clear URL only, keep score/source_type
          result.websiteId = '';
        } else if (urlCheck.status === 'redirected' && urlCheck.finalUrl) {
          result.websiteId = urlCheck.finalUrl;
        }
        // 'unverified' (timeout) → keep websiteId as-is
      }

      logger.info(`[WEB VERIFY] Row ${correlationId} → done in ${Date.now() - start}ms | score: ${result.verificationScore} | source: ${result.sourceType}`);
      return result;
    } catch (error) {
      logAiError('WEB VERIFY', correlationId, error);
      throw error;
    }
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

module.exports = { verifyRow };
