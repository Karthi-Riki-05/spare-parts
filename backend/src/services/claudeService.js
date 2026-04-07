const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config');
const { withRetry } = require('../utils/retry');
const { logger } = require('../utils/logger');
const { logAiError } = require('../utils/aiErrorLogger');
const { mockClaudeEnforcement } = require('./mocks/claudeMock');
const { deduplicateVerified } = require('./deduplicationService');

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
  logger.info(`[RULE ENFORCE] Row ${correlationId} → calling Gemini 2.0-flash fallback (real API)`);

  const prompt = `You are a data quality enforcer for industrial spare parts. Review this AI-verified result and apply strict rules.\n\nOriginal input:\n- Description: ${row.description}\n- Manufacturer: ${row.manufacturer}\n- Item Number: ${row.itemNumber}\n- Type Designation: ${row.typeDesignation}\n- Supplementary: ${row.supplementary}\n\nAI verification result:\n${JSON.stringify(geminiResult, null, 2)}\n\nRULES TO ENFORCE:\n1. If item_number == type_designation (case-insensitive): keep only item_number, clear type_designation\n2. If manufacturer empty: infer from description/part number; if <50% confidence leave blank\n3. Remove any "ERS." prefixes from item_number/type_designation (keep the value after the prefix)\n4. If any field contains Swedish text, translate descriptive words to English (preserve part numbers exactly)\n5. Do NOT modify supplementary unless it contains incorrect part data\n6. Do NOT invent URLs\n\nRespond ONLY with valid JSON, no markdown, no backticks:\n{"description":"","manufacturer":"","item_number":"","type_designation":"","supplementary":"","verified_source":"${geminiResult.verifiedSource}","verification_score":0,"website_id":"${geminiResult.websiteId}","source_type":"${geminiResult.sourceType}","manufacturer_website":"${geminiResult.manufacturerWebsite}","manufacturer_inferred":false}`;

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
        supplementary: raw.supplementary || geminiResult.supplementary,
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
