const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config');
const { withRetry } = require('../utils/retry');
const { logger } = require('../utils/logger');
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
  return `You are verifying industrial spare parts data. Search the web to confirm this part exists and find its official product page.\n\nPart to verify:\n${partInfo}\n\nSEARCH SEQUENCE:\n1. Search "[Manufacturer] [Item Number]" on manufacturer's official website\n2. If not found: search on Octopart, then Mouser, then RS Online, then PLCHardware\n3. Confirm the exact part number appears on the page\n\nMANDATORY RULES:\n- If Manufacturer is empty: infer from description or part number prefix\n- If item_number == type_designation: keep only item_number\n- Fill empty fields ONLY with data confirmed on a real webpage\n\nRespond ONLY with valid JSON, no markdown:\n{"description":"","manufacturer":"","item_number":"","type_designation":"","supplementary":"","verified_source":"Manufacturer website","verification_score":0,"website_id":"","source_type":"official","manufacturer_website":"","manufacturer_inferred":false,"supplementary_used":${useSupplementary},"supplementary_changed":false,"supplementary_original":"","supplementary_type":"unknown"}`;
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
    logger.info('Gemini mock: verifyRow', { correlationId, rowIndex: row.rowIndex });
    return mockVerificationResult(row.rowIndex, row);
  }

  return withRetry(async () => {
    const start = Date.now();
    const prompt = buildPrompt(row, useSupplementary);
    const model = getClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ googleSearch: {} }],
    });
    const genResult = await model.generateContent(prompt);
    const text = genResult.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Gemini response');

    let result = mapResult(JSON.parse(jsonMatch[0]), row.rowIndex);

    if (result.websiteId) {
      const urlCheck = await validateUrl(result.websiteId);
      result.urlValidationStatus = urlCheck.status;
      if (urlCheck.status === 'broken' || urlCheck.status === 'timeout') {
        result.websiteId = '';
        result.sourceType = 'not_found';
      } else if (urlCheck.status === 'redirected' && urlCheck.finalUrl) {
        result.websiteId = urlCheck.finalUrl;
      }
    }

    logger.info('Gemini verifyRow complete', { correlationId, rowIndex: row.rowIndex, score: result.verificationScore, durationMs: Date.now() - start });
    return result;
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

module.exports = { verifyRow };
