const rateLimit = require('express-rate-limit');
const { config } = require('../config');

// ── Global API rate limiter ────────────────────────────────────────────────
// Applied to all rate-limited /api/* routes (everything except health, auth,
// super-admin, ai-status, and cache-stats which are mounted before this).
// Protects against general API abuse and DoS-style floods.
const rateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// ── Login rate limiter ─────────────────────────────────────────────────────
// Applied to POST /api/auth/login and POST /api/super-admin/login.
// Limits failed login attempts to prevent brute-force password attacks.
//
// skipSuccessfulRequests: true — a successful login (HTTP 200) does NOT count
// against the limit; only failures (401/403/5xx) do. Legitimate users who
// mistype their password a few times are not punished for eventually succeeding.
//
// Future: add a second layer keyed on company_id (available after successful
// JWT verification) to limit per-account attempts rather than per-IP. This
// prevents an attacker using many IPs to target a single account.
const loginLimiter = rateLimit({
  windowMs: config.loginRateLimitWindowMs,
  max: config.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// ── Forgot-password rate limiter ───────────────────────────────────────────
// Applied to POST /api/auth/forgot-password.
// Even though the response is always the same ("if that email exists…"), an
// attacker can still use this endpoint to enumerate valid emails via timing
// differences or as a harassment vector (flooding a target with reset emails).
// 10 requests per hour per IP is generous for legitimate use.
const forgotPasswordLimiter = rateLimit({
  windowMs: config.forgotRateLimitWindowMs,
  max: config.forgotRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please try again in 1 hour.' },
});

// ── Reset-password rate limiter ────────────────────────────────────────────
// Applied to POST /api/auth/reset-password.
// Tokens are single-use UUIDs but without a rate limit an attacker could still
// brute-force a 128-bit token — computationally infeasible, but rate-limiting
// is cheap insurance and prevents log spam.
// Shares the same window/max as forgot-password (1 hour / 10 attempts).
const resetPasswordLimiter = rateLimit({
  windowMs: config.forgotRateLimitWindowMs,
  max: config.forgotRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts. Please try again in 1 hour.' },
});

module.exports = { rateLimiter, loginLimiter, forgotPasswordLimiter, resetPasswordLimiter };
