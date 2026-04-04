const OpenAI = require('openai');
const { config } = require('../config');
const { withRetry } = require('../utils/retry');
const { logger } = require('../utils/logger');
const { mockFormatDetection, mockNormalization, mockNormalizeRow, buildMockDetection } = require('./mocks/openaiMock');

let client = null;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: config.openaiApiKey });
  return client;
}

async function detectFormat(sampleRows, correlationId) {
  if (config.openaiMockMode) {
    logger.info('OpenAI mock: detectFormat (heuristic)', { correlationId });
    return buildMockDetection(sampleRows);
  }
  const prompt = `Analyze this Excel file structure. Determine which format it matches:\n\nFORMAT A: Data already in separate columns\nFORMAT B: All data in ONE column\nFORMAT C: Incomplete — Manufacturer column empty\n\nSample rows:\n${JSON.stringify(sampleRows, null, 2)}\n\nRespond ONLY with valid JSON:\n{"format":"A" or "B" or "C","confidence":0-100,"reasoning":"one sentence","suggestedMapping":{"internalItemNumber":"col_0","description":"col_X","manufacturer":"col_X","itemNumber":"col_X","typeDesignation":"col_X","supplementary":"col_X"}}`;

  return withRetry(async () => {
    const start = Date.now();
    const response = await getClient().chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }],
      temperature: 0.1, response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');
    logger.info('OpenAI detectFormat complete', { correlationId, durationMs: Date.now() - start });
    return JSON.parse(content);
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

async function normalizeRow(rawText, correlationId) {
  if (config.openaiMockMode) {
    logger.info('OpenAI mock: normalizeRow', { correlationId });
    return mockNormalizeRow(rawText);
  }
  const prompt = `Extract structured spare parts data from this raw text.\n\nInput: "${rawText}"\n\nRules:\n1. Look for: "Artnr:", "Art.nr.", "P/N:", "Ref:", "ERS."\n2. Manufacturer = recognizable brand (SKF, ABB, Siemens, Bosch, Atlas Copco, Festo, etc.)\n3. If a field contains "ERS." — keep the FULL value including ERS. for the handler to process\n4. If item_number == type_designation: put in item_number only\n5. If any field (description, manufacturer) contains Swedish language text, translate it to English. Preserve technical part numbers, model codes, and alphanumeric identifiers exactly as-is — only translate human-readable descriptive words.\n   Examples: MINNESMODUL → Memory Module, KUGGVÄXELMOTOR → Gear Motor, KONA ANALOGGIVARE → Cone Analog Sensor, FIRMWARE → FIRMWARE (keep as-is)\n6. Missing = empty string\n7. Sequences like ", -" or "- ," are empty data entry placeholders — treat them as null/missing. Do not include them in any field.\n8. For the manufacturer reference code: put it in "type_designation" if it looks like a model/type code. Put it in "item_number" if it looks like a pure numeric or alphanumeric order code. Use both fields if both are clearly present in the text.\n\nReturn ONLY valid JSON:\n{"description":"","manufacturer":"","item_number":"","type_designation":"","supplementary":"","swedish_found":false,"ers_removed":false}`;

  return withRetry(async () => {
    const start = Date.now();
    const response = await getClient().chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }],
      temperature: 0.1, response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');
    logger.info('OpenAI normalizeRow complete', { correlationId, durationMs: Date.now() - start });
    return JSON.parse(content);
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

module.exports = { detectFormat, normalizeRow };
