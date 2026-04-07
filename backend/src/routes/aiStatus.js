const { Router } = require('express');
const { config } = require('../config');

const router = Router();

router.get('/ai-status', (_req, res) => {
  const key = config.geminiApiKey || '';
  const hasKey = key.length > 0;
  res.json({
    provider: 'Google Gemini',
    mockMode: config.mockMode,
    openaiMockMode: config.openaiMockMode,
    geminiMockMode: config.geminiMockMode,
    claudeMockMode: config.claudeMockMode,
    geminiApiKeySet: hasKey,
    geminiApiKeyPreview: hasKey ? `...${key.slice(-4)}` : null,
    models: {
      formatDetection: 'gemini-flash-latest',
      webVerification: 'gemini-2.5-flash',
      ruleEnforcement: 'gemini-flash-latest',
    },
    status: hasKey ? 'ready' : 'missing_key',
  });
});

module.exports = router;
