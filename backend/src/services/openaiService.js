const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config');
const { withRetry } = require('../utils/retry');
const { logger } = require('../utils/logger');
const { logAiError } = require('../utils/aiErrorLogger');
const { mockFormatDetection, mockNormalization, mockNormalizeRow, buildMockDetection } = require('./mocks/openaiMock');

let genAI = null;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(config.geminiApiKey);
  return genAI;
}

function stripJsonFence(text) {
  if (!text) return '';
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

function extractJson(text) {
  const cleaned = stripJsonFence(text);
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in Gemini response');
  return JSON.parse(match[0]);
}

async function detectFormat(sampleRows, correlationId) {
  if (config.openaiMockMode) {
    logger.warn(`[FORMAT DETECT] Row ${correlationId} → MOCK MODE (no real API call)`);
    return buildMockDetection(sampleRows);
  }
  logger.info(`[FORMAT DETECT] Row ${correlationId} → calling Gemini 2.0-flash (real API)`);
  const prompt = `Analyze this Excel file structure. Determine which format it matches:\n\nFORMAT A: Data already in separate columns\nFORMAT B: All data in ONE column\nFORMAT C: Incomplete — Manufacturer column empty\n\nSample rows:\n${JSON.stringify(sampleRows, null, 2)}\n\nRespond ONLY with valid JSON, no markdown, no backticks:\n{"format":"A" or "B" or "C","confidence":0-100,"reasoning":"one sentence","suggestedMapping":{"internalItemNumber":"col_0","description":"col_X","manufacturer":"col_X","itemNumber":"col_X","typeDesignation":"col_X","supplementary":"col_X"}}`;

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
      const parsed = extractJson(text);
      logger.info(`[FORMAT DETECT] Row ${correlationId} → response received in ${Date.now() - start}ms | format: ${parsed.format}`);
      return parsed;
    } catch (error) {
      logAiError('FORMAT DETECT', correlationId, error);
      throw error;
    }
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

async function normalizeRow(rawText, correlationId) {
  if (config.openaiMockMode) {
    logger.warn(`[FORMAT DETECT] Row ${correlationId} → MOCK MODE (no real API call)`);
    return mockNormalizeRow(rawText);
  }
  logger.info(`[FORMAT DETECT] Row ${correlationId} → calling Gemini 2.0-flash (real API)`);
  const prompt = `Extract structured spare parts data from this raw text.\n\nInput: "${rawText}"\n\nRules:\n1. Look for: "Artnr:", "Art.nr.", "P/N:", "Ref:", "ERS."\n2. Manufacturer = recognizable brand (SKF, ABB, Siemens, Bosch, Atlas Copco, Festo, etc.)\n3. If a field contains "ERS." — keep the FULL value including ERS. for the handler to process\n4. If item_number == type_designation: put in item_number only\n5. If any field (description, manufacturer) contains Swedish language text, translate it to English. Preserve technical part numbers, model codes, and alphanumeric identifiers exactly as-is — only translate human-readable descriptive words.\n   Examples: MINNESMODUL → Memory Module, KUGGVÄXELMOTOR → Gear Motor, KONA ANALOGGIVARE → Cone Analog Sensor, FIRMWARE → FIRMWARE (keep as-is)\n6. Missing = empty string\n7. Sequences like ", -" or "- ," are empty data entry placeholders — treat them as null/missing. Do not include them in any field.\n8. For the manufacturer reference code: put it in "type_designation" if it looks like a model/type code. Put it in "item_number" if it looks like a pure numeric or alphanumeric order code. Use both fields if both are clearly present in the text.\n\nReturn ONLY valid JSON, no markdown, no backticks:\n{"description":"","manufacturer":"","item_number":"","type_designation":"","supplementary":"","swedish_found":false,"ers_removed":false}`;

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
      const parsed = extractJson(text);
      logger.info(`[FORMAT DETECT] Row ${correlationId} → response received in ${Date.now() - start}ms | format: normalized`);
      return parsed;
    } catch (error) {
      logAiError('FORMAT DETECT', correlationId, error);
      throw error;
    }
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

module.exports = { detectFormat, normalizeRow };
