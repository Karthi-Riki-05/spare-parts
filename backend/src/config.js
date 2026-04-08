const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { z } = require('zod');

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
  // Single AI provider — all models via GEMINI_API_KEY (with optional 2 and 3)
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_API_KEY_2: z.string().default(''),
  GEMINI_API_KEY_3: z.string().default(''),
  MAX_ROWS_WARNING: z.coerce.number().default(5000),
  MAX_ROWS_LIMIT: z.coerce.number().default(10000),
  BATCH_SIZE: z.coerce.number().default(5),
  MAX_CONCURRENCY: z.coerce.number().default(5),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),
  MAX_RETRIES: z.coerce.number().default(3),
  RETRY_DELAY_MS: z.coerce.number().default(1000),
  CACHE_TTL_SECONDS: z.coerce.number().default(86400),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  LOG_LEVEL: z.string().default('info'),
  MOCK_MODE: z.string().transform(v => v === 'true').default('false'),
  OPENAI_MOCK_MODE: z.string().transform(v => v === 'true').default('false'),
  GEMINI_MOCK_MODE: z.string().transform(v => v === 'true').default('false'),
  CLAUDE_MOCK_MODE: z.string().transform(v => v === 'true').default('false'),
  LOG_WRITE: z.string().transform(v => v === 'true').default('false'),
  // Auth
  JWT_SECRET: z.string().default('changeme-secret-key'),
  ADMIN_EMAIL: z.string().default('tawdev@gmail.com'),
  ADMIN_PASSWORD: z.string().default('T@Wdev$05'),
  COOKIE_SECURE: z.string().transform(v => v === 'true').default('false'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const config = {
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  corsOrigin: parsed.data.CORS_ORIGIN,
  geminiApiKey: parsed.data.GEMINI_API_KEY,
  geminiApiKey2: parsed.data.GEMINI_API_KEY_2,
  geminiApiKey3: parsed.data.GEMINI_API_KEY_3,
  maxRowsWarning: parsed.data.MAX_ROWS_WARNING,
  maxRowsLimit: parsed.data.MAX_ROWS_LIMIT,
  batchSize: parsed.data.BATCH_SIZE,
  maxConcurrency: parsed.data.MAX_CONCURRENCY,
  requestTimeoutMs: parsed.data.REQUEST_TIMEOUT_MS,
  maxRetries: parsed.data.MAX_RETRIES,
  retryDelayMs: parsed.data.RETRY_DELAY_MS,
  cacheTtlSeconds: parsed.data.CACHE_TTL_SECONDS,
  rateLimitWindowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: parsed.data.RATE_LIMIT_MAX,
  logLevel: parsed.data.LOG_LEVEL,
  mockMode: parsed.data.MOCK_MODE,
  openaiMockMode: parsed.data.OPENAI_MOCK_MODE || parsed.data.MOCK_MODE,
  geminiMockMode: parsed.data.GEMINI_MOCK_MODE || parsed.data.MOCK_MODE,
  claudeMockMode: parsed.data.CLAUDE_MOCK_MODE || parsed.data.MOCK_MODE,
  logWrite: parsed.data.LOG_WRITE,
  jwtSecret: parsed.data.JWT_SECRET,
  adminEmail: parsed.data.ADMIN_EMAIL,
  adminPassword: parsed.data.ADMIN_PASSWORD,
  cookieSecure: parsed.data.COOKIE_SECURE,
};

module.exports = { config };
