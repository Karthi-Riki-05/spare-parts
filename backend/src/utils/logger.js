const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { config } = require('../config');

const lineFormat = winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
  const cid = correlationId ? ` [${correlationId}]` : '';
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level.toUpperCase()}${cid} ${message}${extra}`;
});

const transports = [new winston.transports.Console()];

if (config.logWrite) {
  try {
    const logDir = path.resolve(__dirname, '../../logs/ai');
    fs.mkdirSync(logDir, { recursive: true });
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = path.join(logDir, `${dateStr}.log`);
    transports.push(new winston.transports.File({ filename, format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      lineFormat,
    )}));
  } catch (err) {
    console.error(`[logger] LOG_WRITE enabled but file transport disabled: ${err.message}`);
  }
}

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    config.nodeEnv === 'production' ? winston.format.json() : lineFormat,
  ),
  transports,
});

module.exports = { logger };
