const db = require('./pgService');
const { logger } = require('../utils/logger');

const emailToIdCache = new Map();

async function getCompanyIdByEmail(email) {
  if (!email) return null;
  const key = String(email).trim().toLowerCase();
  if (emailToIdCache.has(key)) return emailToIdCache.get(key);

  const row = await db.getOne('SELECT id FROM companies WHERE email = $1', [key]);
  if (!row) {
    logger.warn(`[COMPANY] no company row for ${key}`);
    return null;
  }
  emailToIdCache.set(key, row.id);
  return row.id;
}

async function getCompanyById(id) {
  if (!id) return null;
  return db.getOne(
    `SELECT id, company_name, email, confirmed, is_active, credits_balance,
            created_at, confirmed_at
     FROM companies WHERE id = $1`,
    [id]
  );
}

function invalidateEmailCache(email) {
  if (!email) emailToIdCache.clear();
  else emailToIdCache.delete(String(email).trim().toLowerCase());
}

module.exports = { getCompanyIdByEmail, getCompanyById, invalidateEmailCache };
