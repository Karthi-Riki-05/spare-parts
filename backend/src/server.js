const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { config } = require('./config');
const { logger } = require('./utils/logger');
const { rateLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);

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
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Request timeout: 600s (accounts for Format B/C AI processing on large files)
app.use((req, res, next) => {
  req.setTimeout(600000); // 10 minutes
  res.setTimeout(600000);
  next();
});

app.use((req, _res, next) => {
  req.correlationId = uuidv4();
  next();
});

const { requestLogger } = require('./middleware/requestLogger');
app.use(requestLogger);

app.use('/', require('./routes/views'));

// Health + auth + super-admin + ai-status + cache-stats before rate limiter so
// they're always reachable even under a DDoS-style flood to /api/*.
app.use('/api', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/super-admin', require('./routes/superAdmin'));
app.use('/api', require('./routes/aiStatus'));
app.use('/api/cache-stats', require('./routes/cacheStats'));

app.use(rateLimiter);
app.use('/api', require('./routes/detect'));
app.use('/api', require('./routes/sheets'));
app.use('/api', require('./routes/normalize'));
app.use('/api', require('./routes/manualMap'));
app.use('/api', require('./routes/verify'));
app.use('/api', require('./routes/export'));
app.use('/api', require('./routes/cache'));
const { router: jobsRouter, initResumption: initJobs } = require('./routes/jobs');
app.use('/api/jobs', jobsRouter);
app.use('/api/preferences', require('./routes/preferences'));

// Dev-only email preview + test trigger (disabled in production)
if (config.nodeEnv !== 'production') {
  app.use('/api/dev', require('./routes/devEmail'));
}

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

async function bootstrap() {
  // Run PG migrations + seed super admin before accepting any requests.
  // Fatal if this fails — no point serving traffic against an uninitialized schema.
  try {
    const { runMigrations } = require('./migrations/run');
    await runMigrations();
  } catch (err) {
    logger.error(`[BOOT] Migration failure, aborting: ${err.message}`);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`, { nodeEnv: config.nodeEnv, mockMode: config.mockMode });

    logger.info('══════════════════════════');
    logger.info(' PRODUCTION READINESS     ');
    logger.info('══════════════════════════');
    logger.info(' GEMINI_API_KEY:   ' + (config.geminiApiKey ? 'SET ✅' : 'MISSING ❌'));
    logger.info(' GEMINI_API_KEY_2: ' + (config.geminiApiKey2 ? 'SET ✅' : 'not set'));
    logger.info(' GEMINI_API_KEY_3: ' + (config.geminiApiKey3 ? 'SET ✅' : 'not set'));
    logger.info(' RESEND_API_KEY:   ' + (config.resendApiKey ? 'SET ✅' : 'MISSING ⚠️'));
    logger.info(' APP_URL:          ' + config.appUrl);
    logger.info(' MOCK_MODE:        ' + config.mockMode);
    logger.info(' MAX_CONCURRENCY:  ' + config.maxConcurrency);
    logger.info(' BG_THRESHOLD:     ' + config.backgroundThreshold);
    logger.info(' JWT_SECRET:       ' + (config.jwtSecret.includes('changeme') ? 'DEFAULT ⚠️' : 'CUSTOM ✅'));
    logger.info(' keepAlive:        620000ms');
    logger.info(' headersTimeout:   630000ms');
    logger.info('══════════════════════════');
    
    // Mission: Job system resilience (PG-backed after P2).
    const jobService = require('./services/jobService');
    initJobs().catch(err => logger.error(`[JOB] resumption failed: ${err.message}`));
    setInterval(() => {
      jobService.cleanupOldJobs(48).catch(err => logger.error(`[JOB] cleanup failed: ${err.message}`));
    }, 6 * 60 * 60 * 1000);

    // Daily old-job sweep (30d). PG doesn't need VACUUM in a cron — autovacuum
    // handles it. We only run the stale-row cleanup here.
    setInterval(() => {
      jobService.cleanupOldJobs(30 * 24).catch(err => logger.error(`[JOB] 30d cleanup failed: ${err.message}`));
    }, 86400000);
  });
  // SSE /api/verify can run several minutes. Override Node's default socket timeouts
  // so the kernel/Express doesn't sever long-lived streams.
  server.timeout = 0;              // disable per-request inactivity timeout
  server.keepAliveTimeout = 620000; // > CloudFront/ALB idle timeout
  server.headersTimeout = 630000;   // must be > keepAliveTimeout
  server.requestTimeout = 0;        // no hard request cap

  process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    server.close(() => { logger.info('Server closed'); process.exit(0); });
    setTimeout(() => process.exit(1), 10000);
  });
  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });
}

if (!isTestEnv) {
  bootstrap().catch(err => {
    logger.error(`[BOOT] fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { app };
