const express = require('express');
const { requireCompany } = require('../middleware/authMiddleware');
const db = require('../services/pgService');
const { logger } = require('../utils/logger');

const router = express.Router();

const DEFAULT_KEY = 'datatable_columns';
const KEY_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function normalizeKey(raw) {
  if (!raw) return DEFAULT_KEY;
  const s = String(raw);
  return KEY_RE.test(s) ? s : DEFAULT_KEY;
}

function sanitizeHidden(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (!trimmed || trimmed.length > 100) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 100) break;
  }
  return out;
}

/**
 * GET /api/preferences/columns?key=datatable_columns
 */
router.get('/columns', requireCompany, async (req, res) => {
  try {
    const key = normalizeKey(req.query.key);
    const row = await db.getOne(
      `SELECT hidden_columns
         FROM column_preferences
        WHERE company_id = $1 AND preference_key = $2`,
      [req.company.id, key]
    );
    res.json({
      success: true,
      key,
      hiddenColumns: row && Array.isArray(row.hidden_columns) ? row.hidden_columns : [],
    });
  } catch (err) {
    logger.error(`[PREF] GET columns error: ${err.message}`);
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

/**
 * PUT /api/preferences/columns
 * body: { key?: string, hiddenColumns: string[] }
 */
router.put('/columns', requireCompany, async (req, res) => {
  try {
    const key = normalizeKey(req.body && req.body.key);
    const hidden = sanitizeHidden(req.body && req.body.hiddenColumns);

    await db.execute(
      `INSERT INTO column_preferences
         (company_id, preference_key, hidden_columns, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (company_id, preference_key)
         DO UPDATE SET hidden_columns = EXCLUDED.hidden_columns,
                       updated_at = NOW()`,
      [req.company.id, key, JSON.stringify(hidden)]
    );

    res.json({ success: true, key, hiddenColumns: hidden });
  } catch (err) {
    logger.error(`[PREF] PUT columns error: ${err.message}`);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

module.exports = router;
