const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { config } = require('./config');
const { logger } = require('./utils/logger');
const { rateLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use((req, _res, next) => {
  req.correlationId = uuidv4();
  next();
});

app.use('/', require('./routes/views'));

// Health + ai-status before rate limiter so they're always reachable
app.use('/api', require('./routes/health'));
app.use('/api', require('./routes/aiStatus'));

app.use(rateLimiter);
app.use('/api', require('./routes/detect'));
app.use('/api', require('./routes/sheets'));
app.use('/api', require('./routes/normalize'));
app.use('/api', require('./routes/manualMap'));
app.use('/api', require('./routes/verify'));
app.use('/api', require('./routes/export'));
app.use('/api', require('./routes/cache'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not Found', message: 'Page not found', code: 404 });
});

app.use(errorHandler);

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

function logAiConfigBanner() {
  const key = config.geminiApiKey || '';
  const keyLine = key
    ? `SET (...${key.slice(-4)})`
    : 'MISSING ⚠️';
  const lines = [
    '─────────────────────────────────',
    ' SPARE PARTS VERIFIER — AI CONFIG',
    '─────────────────────────────────',
    ` MOCK_MODE        : ${config.mockMode}`,
    ` OPENAI_MOCK_MODE : ${config.openaiMockMode}`,
    ` GEMINI_MOCK_MODE : ${config.geminiMockMode}`,
    ` CLAUDE_MOCK_MODE : ${config.claudeMockMode}`,
    ` GEMINI_API_KEY   : ${keyLine}`,
    ' AI PROVIDER      : Google Gemini (single provider)',
    '─────────────────────────────────',
  ];
  for (const l of lines) {
    if (!key) logger.warn(l); else logger.info(l);
  }
}

if (!isTestEnv) {
  const server = app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`, { nodeEnv: config.nodeEnv, mockMode: config.mockMode });
    logAiConfigBanner();
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    server.close(() => { logger.info('Server closed'); process.exit(0); });
    setTimeout(() => process.exit(1), 10000);
  });
  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });
}

module.exports = { app };
