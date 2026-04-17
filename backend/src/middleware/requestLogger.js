const { apiLogger, accessLogger } = require('../utils/logger');

function requestLogger(req, res, next) {
  req.startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const meta = {
      requestId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration_ms: duration,
      ip: req.ip,
      companyId: (req.company && req.company.id) || (req.superAdmin && req.superAdmin.id) || null,
      userAgent: req.headers['user-agent'],
    };

    // Access log — every request
    accessLogger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, meta);

    // API error log — 4xx and 5xx
    if (res.statusCode >= 400) {
      apiLogger.error(`${req.method} ${req.path} ${res.statusCode}`, meta);
    }
  });

  next();
}

module.exports = { requestLogger };
