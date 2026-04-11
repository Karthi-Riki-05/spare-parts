const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config');
const { withRetry } = require('../utils/retry');
const { logger } = require('../utils/logger');
const { logAiError } = require('../utils/aiErrorLogger');
const { mockClaudeEnforcement } = require('./mocks/claudeMock');
const { deduplicateVerified } = require('./deduplicationService');
const { classifySupplementary } = require('./supplementaryLogger');

let genAI = null;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(config.geminiApiKey);
  return genAI;
}

function stripJsonFence(text) {
  if (!text) return '';
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

async function enforceRules(row, geminiResult, correlationId) {
  if (config.claudeMockMode) {
    logger.warn(`[RULE ENFORCE] Row ${correlationId} → MOCK MODE (no real API call)`);
    return mockClaudeEnforcement(geminiResult);
  }
  const oldScore = geminiResult.verificationScore;
  const suppType = classifySupplementary(row.supplementary || '');
  const suppLocked = suppType === 'internal_instruction';
  logger.info(`[RULE ENFORCE] Row ${correlationId} → calling Gemini 2.0-flash fallback (real API) | suppLocked=${suppLocked}`);

  const prompt = `You are a data quality enforcer for industrial spare parts. Review this AI-verified result and apply strict rules.\n\nOriginal input:\n- Description: ${row.description}\n- Manufacturer: ${row.manufacturer}\n- Item Number: ${row.itemNumber}\n- Type Designation: ${row.typeDesignation}\n- Supplementary: ${row.supplementary}\n\nAI verification result:\n${JSON.stringify(geminiResult, null, 2)}\n\nRULES TO ENFORCE:\n1. If item_number == type_designation (case-insensitive): keep only item_number, clear type_designation\n2. If manufacturer empty — USE THIS EXACT SEQUENCE:\n   STEP 1 — Check Type Designation prefix:\n     1LA, 1FT, 1FK, 1PH, 6ES7, 6SL3, 6SE7, 6GK, 6RA, SIMATIC, SINAMICS, SINUMERIK → Siemens\n     MKD, MHD, HCS, HDS, R911, MSK, LSF                                          → Bosch Rexroth / Indramat\n     MM0, MLU, MDX, DRS, R77, KA, WA, FA                                          → SEW-Eurodrive\n     LR, OGE, OGH, OGS, OU, OF, SI                                                → IFM Electronic\n     SMT, VADMI, ADNGF, DNC, DSNU, FESTO                                          → Festo\n     BOS, BAM, BTL, BES, BCC                                                      → Balluff\n     NI, BI, BIM, QS, PS                                                          → Turck\n     QST, LTV, ZT, RT                                                             → Atlas Copco\n     62, 63, 22, 23, 32, 33 (bearing nums)                                        → SKF\n     VR, EDS, VM, HDA, HFT                                                        → Hydac\n   STEP 2 — Check Item Number pattern:\n     Starts with R9 followed by 6+ digits  → Bosch Rexroth\n     8-digit number starting 18 or 82      → SEW-Eurodrive\n     Starts with 6ES, 6SL, 6SE, 6GK         → Siemens\n     Starts with H followed by 7 digits     → Hydac\n   STEP 3 — Check Description for brand keywords:\n     Contains SIMATIC, SINAMICS, SINUMERIK, SIMODRIVE  → Siemens\n     Contains MOVIMOT, MOVIDRIVE, MOVITRAC, MOVIAXIS   → SEW-Eurodrive\n     Contains REXROTH, INDRAMAT                        → Bosch Rexroth\n     Contains FESTO (any case)                         → Festo\n     Contains HYDAC (any case)                         → Hydac\n   STEP 4 — Web search using all 3 fields combined:\n     Search 1: "[typeDesignation] manufacturer datasheet"\n     Search 2: "[itemNumber] industrial spare part brand"\n     Search 3: "[description] [typeDesignation] official"\n     Extract manufacturer from search results\n   STEP 5 — Only leave manufacturer blank if ALL 4 steps above fail. Set manufacturer_inferred: true when inferred.\n3. Remove any "ERS." prefixes from item_number/type_designation (keep the value after the prefix)\n4. If any field contains Swedish text, translate descriptive words to English (preserve part numbers exactly)\n5. Supplementary handling: ${suppLocked ? 'LOCKED — supplementary is an internal company instruction (TYPE_B). NEVER modify it. Return it byte-for-byte identical to the original input.' : 'Only modify supplementary if it clearly contains incorrect part-specification data. Otherwise leave unchanged.'}\n6. Do NOT invent URLs. If website_id is present but is a relative path (does not start with http:// or https://), clear it — set website_id to empty string. If website_id path contains /error, /errorpage, /404, /not-found, /login, /signin, /access-denied, /forbidden or /unavailable, clear it.\n7. Fix source_type to match verified_source:\n   - verified_source contains "Manufacturer" → set source_type = "official"\n   - verified_source contains "Distributor"  → set source_type = "distributor"\n   - verified_source contains "Not found"    → set source_type = "not_found"\n   - If score >= 90 and source_type = "not_found" → override source_type to "official"\n   - If score >= 70 and source_type = "not_found" → override source_type to "distributor"\n   - When setting source_type = "official", website_id domain MUST be the manufacturer's own domain. Known European manufacturer domains: siemens.com, abb.com, new.abb.com, se.com (Schneider), festo.com, sew-eurodrive.com, ifm.com, turck.com, balluff.com, hydac.com, bosch-rexroth.com, skf.com, schaeffler.com, ina.com, fag.com, flender.com, lapp.com, phoenix-contact.com, wago.com, pilz.com, sick.com, pepperl-fuchs.com, endress.com, krohne.com, vega.com, danfoss.com, grundfos.com, abb.se, siemens.se, festo.se, sew.se.\n   - If website_id is on rs-online.com, mouser.com, octopart.com, distrelec.com, elfa.se, conrad.com, plchardware.com or any non-manufacturer domain: source_type MUST be "distributor", NOT "official".\n8. Category page score cap: If website_id URL ends with /products/ or /category/, or contains no specific part-number identifier in the path, AND score is 90 or above — reduce score to maximum 70, set source_type to "distributor", and set verified_source to "Category page — specific product page not found".\n\nRespond ONLY with valid JSON, no markdown, no backticks:\n{"description":"","manufacturer":"","item_number":"","type_designation":"","supplementary":"","verified_source":"${geminiResult.verifiedSource}","verification_score":0,"website_id":"${geminiResult.websiteId}","source_type":"${geminiResult.sourceType}","manufacturer_website":"${geminiResult.manufacturerWebsite}","manufacturer_inferred":false}`;

  return withRetry(async () => {
    const start = Date.now();
    try {
      const model = getClient().getGenerativeModel({
        model: 'gemini-flash-latest',
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      });
      const genResult = await model.generateContent(prompt);
      const text = genResult.response.text();
      if (!text) throw new Error('Empty response from Gemini');
      const cleaned = stripJsonFence(text);
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in Gemini response');
      const raw = JSON.parse(jsonMatch[0]);

      let result = {
        ...geminiResult,
        description: raw.description || geminiResult.description,
        manufacturer: raw.manufacturer || geminiResult.manufacturer,
        itemNumber: raw.item_number || geminiResult.itemNumber,
        typeDesignation: raw.type_designation || geminiResult.typeDesignation,
        // Req 3: never alter TYPE_B supplementary regardless of model output
        supplementary: suppLocked ? (row.supplementary || '') : (raw.supplementary || geminiResult.supplementary),
        verificationScore: raw.verification_score || geminiResult.verificationScore,
        manufacturerInferred: raw.manufacturer_inferred || geminiResult.manufacturerInferred,
      };
      result = deduplicateVerified(result);
      logger.info(`[RULE ENFORCE] Row ${correlationId} → done in ${Date.now() - start}ms | score improved: ${oldScore} → ${result.verificationScore}`);
      return result;
    } catch (error) {
      logAiError('RULE ENFORCE', correlationId, error);
      throw error;
    }
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

module.exports = { enforceRules };
