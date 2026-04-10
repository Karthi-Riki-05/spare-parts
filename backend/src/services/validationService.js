const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config');
const { logger } = require('../utils/logger');

let genAI = null;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(config.geminiApiKey);
  return genAI;
}

/**
 * Validate that an Excel file contains spare parts data before wasting AI quota.
 * Uses gemini-flash-latest (fast, cheap — ~$0.00001 per call).
 */
async function validateSparePartsContent(sampleRows) {
  if (config.openaiMockMode) {
    logger.info('[VALIDATE] Mock mode — skipping content validation');
    return { valid: true, confidence: 100, detectedType: 'spare_parts', reason: 'Mock mode' };
  }

  if (!sampleRows || sampleRows.length === 0) {
    return { valid: false, confidence: 0, detectedType: 'empty', reason: 'No data rows found in file.' };
  }

  try {
    const model = getClient().getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    });

    const prompt = `You are validating an Excel file for a spare parts verification system.
Analyze these sample rows and determine if this file contains industrial spare parts data.

Spare parts data typically contains:
- Part descriptions (e.g. 'ball bearing', 'servo motor', 'sensor', 'valve', 'gear motor')
- Manufacturer names (e.g. SKF, Siemens, Festo, ABB, Bosch, SEW-Eurodrive)
- Part/item numbers (alphanumeric codes like 6ES7953-8LL31, R911318481)
- Type designations or model numbers

Non-spare-parts data includes: device logs, financial records, user lists, IoT telemetry, CRM data, HR records.

Sample rows:
${JSON.stringify(sampleRows.slice(0, 10), null, 2)}

Respond ONLY with valid JSON:
{"isSparePartsData":true,"confidence":0,"detectedType":"spare_parts","reason":"one sentence explanation"}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Accept if AI says it's spare parts data (regardless of confidence)
    // Only reject if AI explicitly says it's NOT spare parts data
    const isValid = parsed.isSparePartsData === true;

    logger.info(`[VALIDATE] Content validation: valid=${isValid} confidence=${parsed.confidence} type=${parsed.detectedType}`);

    return {
      valid: isValid,
      confidence: parsed.confidence || 0,
      detectedType: parsed.detectedType || 'unknown',
      reason: parsed.reason || '',
    };
  } catch (err) {
    // If validation itself fails, let the file through — don't block on validation errors
    logger.warn(`[VALIDATE] Content validation failed (allowing file through): ${err.message}`);
    return { valid: true, confidence: 0, detectedType: 'unknown', reason: 'Validation check failed — proceeding.' };
  }
}

module.exports = { validateSparePartsContent };
