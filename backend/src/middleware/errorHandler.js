const { logger } = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  const correlationId = req.correlationId;
  const statusCode = err.statusCode || 500;

  logger.error(err.message, {
    correlationId,
    statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    res.status(statusCode).render('error', {
      title: 'Error',
      message: statusCode === 500 ? 'Internal server error' : err.message,
      code: statusCode,
    });
    return;
  }

  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : err.message,
    correlationId,
  });
}

module.exports = { errorHandler };
