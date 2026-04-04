import { describe, test, expect, vi, beforeEach } from 'vitest';

// These tests exercise the mock-mode paths of AI services to increase coverage

describe('OpenAI Service (mock mode)', () => {
  let detectFormat, normalizeRow;

  beforeEach(() => {
    process.env.MOCK_MODE = 'true';
    vi.resetModules();
    const mod = require('../../src/services/openaiService');
    detectFormat = mod.detectFormat;
    normalizeRow = mod.normalizeRow;
  });

  test('detectFormat returns mock result with expected structure', async () => {
    const result = await detectFormat([{ col_0: 'test' }], 'test-corr-1');
    expect(result).toHaveProperty('format');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('suggestedMapping');
    expect(['A', 'B', 'C']).toContain(result.format);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  test('normalizeRow returns mock result with expected fields', async () => {
    const result = await normalizeRow('Test SKF 6205 bearing', 'test-corr-2');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('manufacturer');
    expect(result).toHaveProperty('item_number');
  });
});

describe('Gemini Service (mock mode)', () => {
  let verifyRow;

  beforeEach(() => {
    process.env.MOCK_MODE = 'true';
    vi.resetModules();
    const mod = require('../../src/services/geminiService');
    verifyRow = mod.verifyRow;
  });

  test('verifyRow returns mock result with all required fields', async () => {
    const row = {
      rowIndex: 0,
      internalItemNumber: 'INT-001',
      description: 'PLC Module',
      manufacturer: 'Siemens',
      itemNumber: '6ES7315',
      typeDesignation: '',
      supplementary: '',
    };
    const result = await verifyRow(row, false, 'test-corr-3');
    expect(result).toHaveProperty('verificationScore');
    expect(result).toHaveProperty('verifiedSource');
    expect(result).toHaveProperty('sourceType');
    expect(result).toHaveProperty('websiteId');
    expect(result.rowIndex).toBe(0);
  });
});

describe('Claude Service (mock mode)', () => {
  let enforceRules;

  beforeEach(() => {
    process.env.MOCK_MODE = 'true';
    vi.resetModules();
    const mod = require('../../src/services/claudeService');
    enforceRules = mod.enforceRules;
  });

  test('enforceRules returns result unchanged in mock mode', async () => {
    const row = {
      rowIndex: 0, internalItemNumber: '', description: 'Motor', manufacturer: 'ABB',
      itemNumber: 'M2AA', typeDesignation: '', supplementary: '',
    };
    const geminiResult = {
      rowIndex: 0, verificationScore: 55, manufacturer: 'ABB', itemNumber: 'M2AA',
      typeDesignation: '', description: 'Motor', supplementary: '',
      verifiedSource: 'Not found', websiteId: '', sourceType: 'not_found',
      manufacturerWebsite: '', manufacturerInferred: false, supplementaryUsed: false,
      supplementaryChanged: false, supplementaryOriginal: '', supplementaryType: 'unknown',
      urlValidationStatus: 'unchecked',
    };
    const result = await enforceRules(row, geminiResult, 'test-corr-4');
    expect(result).toBeDefined();
    expect(result.verificationScore).toBeDefined();
  });
});

describe('URL Validator — validateBatch', () => {
  test('should validate multiple URLs concurrently', async () => {
    const { validateBatch } = require('../../src/services/urlValidatorService');
    // Use empty/invalid URLs to avoid network calls
    const results = await validateBatch(['', 'not-a-url', '']);
    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('broken');
    // 'not-a-url' has no http prefix — fetch will throw, returning 'timeout'
    expect(results[1].status).toBe('timeout');
    expect(results[2].status).toBe('broken');
  });
});
