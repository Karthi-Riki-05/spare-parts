const express = require('express');
const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { COOKIE_NAME } = require('../middleware/authMiddleware');

const router = express.Router();

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24h

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  };
}

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const ok =
      String(email).trim().toLowerCase() === String(config.adminEmail).trim().toLowerCase() &&
      String(password) === String(config.adminPassword);

    if (!ok) {
      logger.warn('[AUTH] login failed for ' + email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { email: config.adminEmail },
      config.jwtSecret,
      { expiresIn: TOKEN_TTL_SECONDS }
    );

    res.cookie(COOKIE_NAME, token, cookieOptions());
    logger.info('[AUTH] login ok ' + config.adminEmail);
    return res.json({ success: true, user: { email: config.adminEmail } });
  } catch (err) {
    logger.error('[AUTH] login error: ' + err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  try {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ success: true });
  } catch (err) {
    logger.error('[AUTH] logout error: ' + err.message);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

router.get('/me', (req, res) => {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, config.jwtSecret);
    return res.json({ user: { email: decoded.email } });
  } catch (err) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.status(401).json({ error: 'Session expired' });
  }
});

module.exports = router;
