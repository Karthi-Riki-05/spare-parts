const { Router } = require('express');
const { config } = require('../config');
const { getRecentErrors } = require('../utils/aiErrorLogger');

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

router.get('/ai-errors', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const errors = getRecentErrors(Math.min(limit, 200));
    res.json({ success: true, errors, count: errors.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
