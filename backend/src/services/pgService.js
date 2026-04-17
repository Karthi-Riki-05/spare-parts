const pool = require('../config/database');
const { logger } = require('../utils/logger');

async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn(`[PG SLOW QUERY] ${duration}ms — ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
    }
    return res;
  } catch (err) {
    logger.error(`[PG QUERY ERROR] ${err.message} — ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
    throw err;
  }
}

async function getOne(text, params = []) {
  const res = await query(text, params);
  return res.rows[0] || null;
}

async function getMany(text, params = []) {
  const res = await query(text, params);
  return res.rows;
}

async function execute(text, params = []) {
  return query(text, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, getOne, getMany, execute, withTransaction, pool };
