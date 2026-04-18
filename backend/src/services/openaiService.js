const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config');
const { withRetry } = require('../utils/retry');
const { logger } = require('../utils/logger');
const { logAiError } = require('../utils/aiErrorLogger');
const { buildMockDetection } = require('./mocks/openaiMock');

// Multi-client pool for rate-limit avoidance
let clients = [];
let nextClientIdx = 0;

function getClients() {
  if (clients.length === 0) {
    const keys = [config.geminiApiKey, config.geminiApiKey2, config.geminiApiKey3].filter(k => k && k.trim());
    clients = keys.map(key => ({
      genAI: new GoogleGenerativeAI(key),
      suffix: key.slice(-4)
    }));
    logger.info(`AI Pool initialized with ${clients.length} keys.`);
  }
  return clients;
}

function getNextClient() {
  const pool = getClients();
  if (pool.length === 0) throw new Error('No Gemini API keys configured');
  const client = pool[nextClientIdx];
  nextClientIdx = (nextClientIdx + 1) % pool.length;
  return client;
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
  if (config.openaiMockMode) return buildMockDetection(sampleRows);
  
  const client = getNextClient();
  logger.info(`[FORMAT DETECT] ${correlationId} → calling Gemini (Key ...${client.suffix})`);
  
  const prompt = `Classify this Excel data shape by INSPECTING THE CELL VALUES of the data rows (not the header names — headers can be misleading). Respond ONLY with valid JSON.

Sample rows (col_0 is always the internal item number — ignore for classification):
${JSON.stringify(sampleRows, null, 2)}

Format definitions (decide by where the actual data lives in the data rows):
- "A" = Manufacturer, item-number, and type-designation each appear in their OWN separate columns and are populated across most data rows. Description (if present) is short.
- "B" = Only one column (typically col_1) holds free-text containing manufacturer + part number + type all crammed together. The other product columns (manufacturer / item number / type designation / supplementary) are EMPTY or nearly empty across the data rows. Headers may still look like Format A — IGNORE the headers and look at whether those cells are blank.
- "C" = Hybrid: some product columns are populated, others are blank, and the description column also contains structured info that needs parsing.

Critical: if col_1 contains long strings with brand + part number AND col_2..col_5 are mostly empty in the data rows → this is "B", regardless of header text.

{"format":"A" or "B" or "C","confidence":0-100,"reasoning":"one sentence citing which cells are populated/empty","suggestedMapping":{"internalItemNumber":"col_0","description":"col_X","manufacturer":"col_X","itemNumber":"col_X","typeDesignation":"col_X","supplementary":"col_X"}}`;

  return withRetry(async () => {
    const start = Date.now();
    try {
      const model = client.genAI.getGenerativeModel({
        model: 'gemini-flash-latest',
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      });
      const genResult = await model.generateContent(prompt);
      const text = genResult.response.text();
      const parsed = extractJson(text);
      logger.info(`[FORMAT DETECT] ${correlationId} → done in ${Date.now() - start}ms | format: ${parsed.format}`);
      return parsed;
    } catch (error) {
      logAiError('FORMAT DETECT', correlationId, error);
      throw error;
    }
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

/**
 * Batch normalize rows in ONE call
 * Triple-key rotation ensures we never hit rate limits during large file uploads
 */
async function normalizeRowsBatch(rawTextsWithIndices, correlationId) {
  if (!rawTextsWithIndices.length) return [];
  
  const client = getNextClient();
  const batchSize = rawTextsWithIndices.length;
  logger.info(`[BATCH NORMALIZE] ${batchSize} rows → calling Gemini (Key ...${client.suffix})`);

  const itemsJson = rawTextsWithIndices.map(({ text }, i) => `${i + 1}. "${text}"`).join('\n');
  const prompt = `Extract spare parts data from these ${batchSize} texts. Respond with a JSON array of ${batchSize} objects.\n\n${itemsJson}\n\nRULES:\n1. Manufacturer = brand (SKF, ABB, etc.)\n2. item_number = order code, type_designation = model\n3. Translate Swedish descriptive words to English (Keep technical codes as-is).\n4. Return exactly ${batchSize} items in input order.\n\n[{"description":"","manufacturer":"","item_number":"","type_designation":"","supplementary":"","swedish_found":false}, ...]`;

  return withRetry(async () => {
    const start = Date.now();
    try {
      const model = client.genAI.getGenerativeModel({
        model: 'gemini-flash-latest',
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      });
      const genResult = await model.generateContent(prompt);
      const text = genResult.response.text();
      if (!text) throw new Error('Empty response from Gemini');
      
      const cleaned = stripJsonFence(text);
      const array = JSON.parse(cleaned);
      
      if (!Array.isArray(array)) throw new Error('Expected JSON array');
      
      // Sanitization layer: Convert any null/undefined values to empty strings
      const sanitized = array.map(item => ({
        description: String(item.description || ''),
        manufacturer: String(item.manufacturer || ''),
        item_number: String(item.item_number || ''),
        type_designation: String(item.type_designation || ''),
        supplementary: String(item.supplementary || ''),
        swedish_found: Boolean(item.swedish_found)
      }));

      logger.info(`[BATCH NORMALIZE] ${batchSize} rows processed in ${Date.now() - start}ms (Key ...${client.suffix})`);
      return sanitized.slice(0, batchSize);
    } catch (error) {
      logAiError('BATCH NORMALIZE', correlationId, error);
      throw error;
    }
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

// Single row fallback (Legacy)
async function normalizeRow(rawText, correlationId) {
  return (await normalizeRowsBatch([{ text: rawText }], correlationId))[0];
}

module.exports = { detectFormat, normalizeRow, normalizeRowsBatch };
