const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config');
const { withRetry } = require('../utils/retry');
const { logger } = require('../utils/logger');
const { logAiError } = require('../utils/aiErrorLogger');
const { mockVerificationResult } = require('./mocks/geminiMock');
const geminiPool = require('./geminiPool');

const clients = new Map();

function getClient(apiKey) {
  const keyToUse = apiKey || config.geminiApiKey;
  if (!keyToUse) {
    throw new Error('No Gemini API key configured');
  }
  if (!clients.has(keyToUse)) {
    clients.set(keyToUse, new GoogleGenerativeAI(keyToUse));
  }
  return clients.get(keyToUse);
}

function buildPrompt(row, useSupplementary) {
  // itemNumber is EXCLUDED here to force the AI to find it in the text.
  let partInfo = `- Description: ${row.description || 'empty'}\n- Manufacturer: ${row.manufacturer || 'empty'}\n- Type Designation: ${row.typeDesignation || 'empty'}`;

  if (useSupplementary && row.supplementary) {
    partInfo += `\n- Supplementary Info: ${row.supplementary}`;
  }

  return `You are an industrial spare parts data specialist. Your job is to extract the part number from the description, identify the manufacturer, and find the official product page on the web.

PART DATA:
${partInfo}

STEP 1 — EXTRACT ITEM NUMBER:
- Look inside Description and Supplementary Info for patterns like: Artnr, Art.nr, Part No, PN, Item#, Artikelnummer, or any standalone alphanumeric code that looks like a manufacturer part number.
- Set extracted_item_number to the value you find. If none found, leave it empty.

STEP 2 — IDENTIFY MANUFACTURER (if manufacturer field is empty):
Check Type Designation prefix first:
  1LA, 1FT, 1FK, 1PH, 6ES7, 6SL3, 6SE7, 6GK, 6RA, SIMATIC, SINAMICS, SINUMERIK → Siemens
  MKD, MHD, HCS, HDS, R911, MSK, LSF                                              → Bosch Rexroth
  MM0, MLU, MDX, DRS, R77, KA, WA, FA                                             → SEW-Eurodrive
  LR, OGE, OGH, OGS, OU, OF, SI                                                   → IFM Electronic
  SMT, VADMI, ADNGF, DNC, DSNU, FESTO                                             → Festo
  BOS, BAM, BTL, BES, BCC                                                         → Balluff
  NI, BI, BIM, QS, PS                                                             → Turck
  QST, LTV, ZT, RT                                                                → Atlas Copco
  62, 63, 22, 23, 32, 33 (bearing numbers)                                        → SKF
  VR, EDS, VM, HDA, HFT                                                           → Hydac

Check Item Number pattern:
  Starts with R9 + 6 or more digits → Bosch Rexroth
  8-digit number starting with 18 or 82 → SEW-Eurodrive
  Starts with 6ES, 6SL, 6SE, 6GK → Siemens
  Starts with H + 7 digits → Hydac

Check Description for brand keywords:
  SIMATIC, SINAMICS, SINUMERIK, SIMODRIVE → Siemens
  MOVIMOT, MOVIDRIVE, MOVITRAC, MOVIAXIS → SEW-Eurodrive
  REXROTH, INDRAMAT → Bosch Rexroth
  FESTO → Festo
  HYDAC → Hydac
  ATLAS COPCO → Atlas Copco
  SKF → SKF

If none of the above match, search the web: "[typeDesignation] manufacturer" and "[description] brand industrial".
Set manufacturer_inferred: true if you had to infer the manufacturer.
Only leave manufacturer blank if all methods above fail.

STEP 3 — SEARCH THE WEB:
SEARCH SEQUENCE (follow in order):
1. Search "[Manufacturer] [extracted_item_number OR typeDesignation]" on the manufacturer's official website. Try both .com and regional European domains (.de, .se, .fi, .no, .dk, .nl, .fr, .it, .es, .pl, .at).
2. If not found on the manufacturer site, search these European distributors in order: rs-online.com, uk.rs-online.com, se.rs-online.com, mouser.com, mouser.se, eu.mouser.com, octopart.com, plchardware.com, distrelec.com, distrelec.se, elfa.se, elfadistrelec.se, conrad.com.
3. Confirm the exact part number appears on the found page.

STEP 3b — CROSS-VERIFY MATCH:
After finding a page, verify ALL of:
a) The exact part number appears on the page.
b) The product TYPE on the page is consistent with the input description. Example: if description says "contactor", the page must show a contactor — not a relay or circuit breaker.
If part number IS found but product TYPE does NOT match description:
- Maximum score: 60
- source_type: "distributor" or "unknown"
- Add note in verified_source: "Part number found but product type mismatch with description"
If BOTH part number AND product type match description:
- Score normally (90-100 or 70-89).

MANDATORY URL RULES:
- website_id MUST be a complete absolute URL starting with https:// or http://. NEVER return a relative path like /products/item or /en/catalogue/part. If you find a relative path, prepend the full manufacturer domain to make it absolute. Example WRONG: /ph/en/product/LV510337/ — Example CORRECT: https://www.se.com/ph/en/product/LV510337/.
- website_id MUST be a direct HTML product page URL.
- website_id MUST NOT end in .pdf — HTML pages only. If only a PDF exists, leave website_id empty.
- NEVER use these domains: indiamart.com, alibaba.com, aliexpress.com, amazon.com, ebay.com, made-in-china.com, tradeindia.com, exportersindia.com.
- NEVER return a URL whose path contains any of: /error, /errorpage, /404, /not-found, /page-not-found, /login, /signin, /access-denied, /forbidden, /unavailable. These are not valid product pages. If the only URL you find leads to one of these paths, leave website_id empty.

PRODUCT PAGE vs CATEGORY PAGE (mandatory):
A valid product page shows ONE specific part with its exact part number visible. A category/listing page shows MULTIPLE products or a product family overview.
Signs of a CATEGORY page (not valid for score 90+):
- URL ends in /products/ or /category/ without a specific model identifier
- Page title is a product family name, not a specific part number
- No exact part number visible on page
If ONLY a category page exists (no specific product page):
- Maximum score allowed: 70
- source_type must be "distributor" even if it is the manufacturer site
- Do NOT call it "official" for a category page
If a SPECIFIC product page exists:
- Score normally (90-100 for official, 70-89 for distributor).

SCORING (verification_score is an INTEGER 0-100):
- 90-100: exact part confirmed on official manufacturer HTML page.
- 70-89:  exact part confirmed on a major distributor HTML page (Mouser, RS, Octopart, PLCHardware).
- 50-69:  similar or related part found, partial match only.
- 0-49:   not found or only generic results.
Use score 0 ONLY when the part is completely unfindable after ALL search steps above have been attempted. NEVER use score 1 — it is reserved and must not appear in any output. Minimum score for any partial finding is 40.

SOURCE TYPE RULES:
- "official"     → website_id is on the manufacturer's own domain.
- "distributor"  → website_id is on Mouser, RS, Octopart, PLCHardware, or any other reseller.
- "not_found"    → part not confirmed anywhere, website_id must be empty.
- "unknown"      → only valid when score is below 50.

SCORE AND SOURCE_TYPE CONSISTENCY (mandatory):
- score 90-100 → source_type MUST be "official"
- score 70-89  → source_type MUST be "distributor"
- score 50-69  → source_type must be "distributor" or "unknown"
- score below 50 → source_type must be "not_found" or "unknown"
NEVER return score 90 or above with source_type "not_found".

Respond with ONLY a single valid JSON object. No markdown, no prose, no explanation:
{"extracted_item_number":"","description":"","manufacturer":"","type_designation":"","supplementary":"","verified_source":"","verification_score":0,"website_id":"","source_type":"not_found","manufacturer_website":"","manufacturer_inferred":false,"supplementary_used":${useSupplementary},"supplementary_changed":false,"supplementary_original":"","supplementary_type":"unknown"}`;
}

function tryParseObjectContaining(text, requiredKey) {
  let i = 0;
  const matches = [];
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open === -1) break;
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
  for (let k = matches.length - 1; k >= 0; k--) {
    try { return JSON.parse(matches[k]); } catch { /* try next */ }
  }
  return null;
}

function extractVerifyJson(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const lastOpen = cleaned.lastIndexOf('{');
  const lastClose = cleaned.lastIndexOf('}');
  if (lastOpen !== -1 && lastClose > lastOpen) {
    try { return JSON.parse(cleaned.slice(lastOpen, lastClose + 1)); } catch { /* fall through */ }
  }
  const byScore = tryParseObjectContaining(cleaned, 'verification_score');
  if (byScore) return byScore;
  const bySource = tryParseObjectContaining(cleaned, 'source_type');
  if (bySource) return bySource;
  return null;
}

function safeDefaultRaw(row, useSupplementary) {
  return {
    extracted_item_number: '',
    description: row.description || '',
    manufacturer: row.manufacturer || '',
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

// Takes the full original row as second argument so we can
// always preserve the original Excel itemNumber in the output.
function mapResult(raw, originalRow) {
  return {
    rowIndex: originalRow.rowIndex,
    internalItemNumber: '',

    // Original itemNumber from Excel — always preserved
    itemNumber: originalRow.itemNumber || '',

    // Part number the AI extracted from description text
    extractedItemNumber: raw.extracted_item_number || '',

    description: raw.description || originalRow.description || '',
    manufacturer: raw.manufacturer || originalRow.manufacturer || '',
    typeDesignation: raw.type_designation || originalRow.typeDesignation || '',
    supplementary: raw.supplementary || originalRow.supplementary || '',

    verifiedSource: raw.verified_source || 'Not found',
    verificationScore: raw.verification_score || 0,
    websiteId: raw.website_id || '',
    sourceType: raw.source_type === 'distributor' ? 'external' : (raw.source_type || 'not_found'),
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

  const apiKey = geminiPool.getNextKey();
  const keyNum = geminiPool.getKeyIndex();
  logger.info(`[WEB VERIFY] Row ${correlationId} → calling Gemini 2.5-flash with Google Search [GEMINI POOL] key=${keyNum}/${geminiPool.getKeyCount()}`);

  return withRetry(async () => {
    const start = Date.now();
    try {
      const prompt = buildPrompt(row, useSupplementary);

      const model = getClient(apiKey).getGenerativeModel({
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

      // Pass full original row so mapResult can preserve itemNumber from Excel
      let result = mapResult(parsed, row);

      // URL validation removed here — handled by verificationService.js urlPool

      logger.info(`[WEB VERIFY] Row ${correlationId} → done in ${Date.now() - start}ms | score: ${result.verificationScore} | source: ${result.sourceType}`);
      return result;
    } catch (error) {
      logAiError('WEB VERIFY', correlationId, error);
      throw error;
    }
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

module.exports = { verifyRow };