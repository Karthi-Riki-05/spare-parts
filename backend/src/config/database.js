const { Pool } = require('pg');
const { config } = require('../config');
const { logger } = require('../utils/logger');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error(`[PG] pool error: ${err.message}`);
});

module.exports = pool;
