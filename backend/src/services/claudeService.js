const Anthropic = require('@anthropic-ai/sdk');
const { config } = require('../config');
const { withRetry } = require('../utils/retry');
const { logger } = require('../utils/logger');
const { mockClaudeEnforcement } = require('./mocks/claudeMock');
const { deduplicateVerified } = require('./deduplicationService');

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

async function enforceRules(row, geminiResult, correlationId) {
  if (config.claudeMockMode) {
    logger.info('Claude mock: enforceRules', { correlationId, rowIndex: row.rowIndex });
    return mockClaudeEnforcement(geminiResult);
  }

  // Swedish translation moved to normalization step (openaiService.js)
  // ERS. handling moved to normalizeController via ersHandler.js
  const prompt = `You are a data quality enforcer for industrial spare parts. Review this AI-verified result and apply strict rules.\n\nOriginal input:\n- Description: ${row.description}\n- Manufacturer: ${row.manufacturer}\n- Item Number: ${row.itemNumber}\n- Type Designation: ${row.typeDesignation}\n- Supplementary: ${row.supplementary}\n\nAI verification result:\n${JSON.stringify(geminiResult, null, 2)}\n\nRULES TO ENFORCE:\n1. If item_number == type_designation (case-insensitive): keep only item_number\n2. If manufacturer empty: infer from description/part number; if <50% confidence leave blank\n3. Do NOT modify supplementary unless it contains incorrect part data\n4. Do NOT invent URLs\n\nRespond ONLY with valid JSON:\n{"description":"","manufacturer":"","item_number":"","type_designation":"","supplementary":"","verified_source":"${geminiResult.verifiedSource}","verification_score":0,"website_id":"${geminiResult.websiteId}","source_type":"${geminiResult.sourceType}","manufacturer_website":"${geminiResult.manufacturerWebsite}","manufacturer_inferred":false}`;

  return withRetry(async () => {
    const start = Date.now();
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6-20250514', max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock) throw new Error('Empty response from Claude');
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Claude response');
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
    logger.info('Claude enforceRules complete', { correlationId, rowIndex: row.rowIndex, durationMs: Date.now() - start });
    return result;
  }, config.maxRetries, config.retryDelayMs, correlationId);
}

module.exports = { enforceRules };
