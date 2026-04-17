const fs = require('fs');
const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');
const { config } = require('../config');

const LOG_DIR = process.env.LOG_DIR || path.resolve(__dirname, '../../logs');

// Ensure log subdirectories exist
['error', 'api', 'access', 'ai'].forEach(dir => {
  const fullPath = path.join(LOG_DIR, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// ── Formats ─────────────────────────────────────────────────

const lineFormat = winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  const stackStr = stack ? '\n  Stack: ' + stack : '';
  return `${timestamp} ${level.toUpperCase()} ${message}${stackStr}${metaStr}`;
});

const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
);

// ── Transports ──────────────────────────────────────────────

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(baseFormat, lineFormat),
});

// Error log — errors only, 30 day retention
const errorFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(LOG_DIR, 'error', '%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '30d',
  zippedArchive: true,
  format: winston.format.combine(baseFormat, lineFormat),
});

// AI log — kept from original setup
const aiFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(LOG_DIR, 'ai', '%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  zippedArchive: true,
  format: winston.format.combine(baseFormat, lineFormat),
});

// API log — 4xx/5xx responses
const apiFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(LOG_DIR, 'api', '%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'info',
  maxSize: '20m',
  maxFiles: '14d',
  zippedArchive: true,
  format: winston.format.combine(baseFormat, lineFormat),
});

// Access log — all HTTP requests
const accessFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(LOG_DIR, 'access', '%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'info',
  maxSize: '50m',
  maxFiles: '14d',
  zippedArchive: true,
  format: winston.format.combine(baseFormat, lineFormat),
});

// ── Main logger (console + error file + ai file) ────────────

const mainTransports = [consoleTransport, errorFileTransport, aiFileTransport];

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    baseFormat,
    config.nodeEnv === 'production' ? winston.format.json() : lineFormat,
  ),
  transports: mainTransports,
});

// ── API logger (api error file) ─────────────────────────────

const apiLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(baseFormat, lineFormat),
  transports: [apiFileTransport],
});

// ── Access logger (access file) ─────────────────────────────

const accessLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(baseFormat, lineFormat),
  transports: [accessFileTransport],
});

module.exports = { logger, apiLogger, accessLogger };
