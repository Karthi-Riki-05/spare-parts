const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { logger } = require('../utils/logger');

const COOKIE_NAME = 'spare_parts_token';

function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    return next();
  } catch (err) {
    res.clearCookie(COOKIE_NAME);
    logger.warn('[AUTH] token rejected: ' + (err && err.message));
    return res.status(401).json({ error: 'Session expired' });
  }
}

module.exports = { requireAuth, COOKIE_NAME };
