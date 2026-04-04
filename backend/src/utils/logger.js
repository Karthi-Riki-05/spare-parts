const winston = require('winston');
const { config } = require('../config');

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    config.nodeEnv === 'production'
      ? winston.format.json()
      : winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
          const cid = correlationId ? ` [${correlationId}]` : '';
          const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} ${level.toUpperCase()}${cid} ${message}${extra}`;
        }),
  ),
  transports: [new winston.transports.Console()],
});

module.exports = { logger };
