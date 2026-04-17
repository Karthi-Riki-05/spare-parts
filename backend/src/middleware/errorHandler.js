const { logger } = require('../utils/logger');

const USER_MESSAGES = {
  QUOTA: {
    status: 503,
    userMessage: 'The verification service is temporarily unavailable. Please try again in a few minutes.',
    logLevel: 'error',
  },
  RATE_LIMIT: {
    status: 429,
    userMessage: 'Too many requests. Please wait a moment and try again.',
    logLevel: 'warn',
  },
  VALIDATION: {
    status: 422,
    userMessage: 'The uploaded file could not be processed. Please check the format and try again.',
    logLevel: 'info',
  },
  UNAUTHORIZED: {
    status: 401,
    userMessage: 'Your session has expired. Please log in again.',
    logLevel: 'info',
  },
  FORBIDDEN: {
    status: 403,
    userMessage: 'You do not have permission to perform this action.',
    logLevel: 'warn',
  },
  FILE_TOO_LARGE: {
    status: 413,
    userMessage: 'The file is too large. Maximum size is 50MB.',
    logLevel: 'info',
  },
  INVALID_FILE: {
    status: 422,
    userMessage: 'This file does not appear to contain spare parts data. Please upload a valid Excel file.',
    logLevel: 'info',
  },
  DB_ERROR: {
    status: 503,
    userMessage: 'A database error occurred. Please try again. If the problem persists, contact support.',
    logLevel: 'error',
  },
  TIMEOUT: {
    status: 504,
    userMessage: 'The request timed out. Please try again.',
    logLevel: 'warn',
  },
  INTERNAL: {
    status: 500,
    userMessage: 'Something went wrong on our end. Our team has been notified. Please try again.',
    logLevel: 'error',
  },
};

function classifyError(err) {
  const msg = err.message || '';
  const code = err.code || '';
  const status = err.statusCode || err.status || 0;

  if (msg.includes('spending cap') || msg.includes('quota') || /QUOTA|RESOURCE_EXHAUSTED/i.test(msg) || code === 'QUOTA') {
    return 'QUOTA';
  }
  if (status === 429 && !msg.includes('spending cap')) return 'RATE_LIMIT';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 413 || code === 'LIMIT_FILE_SIZE') return 'FILE_TOO_LARGE';
  if (code && typeof code === 'string' && (code.startsWith('23') || code.startsWith('42'))) return 'DB_ERROR';
  if (msg.includes('ECONNREFUSED') && msg.includes('5432')) return 'DB_ERROR';
  if (/timeout|ETIMEDOUT/i.test(msg) || status === 504) return 'TIMEOUT';
  if (status === 422 || status === 400) return 'VALIDATION';

  return 'INTERNAL';
}

function sanitizeBody(body) {
  if (!body) return {};
  const safe = { ...body };
  delete safe.password;
  delete safe.password_hash;
  delete safe.currentPassword;
  delete safe.newPassword;
  delete safe.token;
  delete safe.fileData;
  return safe;
}

function errorHandler(err, req, res, _next) {
  const errorType = classifyError(err);
  const errorDef = USER_MESSAGES[errorType] || USER_MESSAGES.INTERNAL;
  const status = err.statusCode || err.status || errorDef.status;

  const logMethod = errorDef.logLevel || 'error';
  logger[logMethod](`[${errorType}] ${err.message}`, {
    requestId: req.correlationId,
    endpoint: req.path,
    method: req.method,
    companyId: (req.company && req.company.id) || null,
    errorCode: err.code,
    statusCode: status,
    stack: err.stack,
    body: sanitizeBody(req.body),
  });

  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    res.status(status).render('error', {
      title: 'Error',
      message: errorDef.userMessage,
      code: status,
    });
    return;
  }

  res.status(status).json({
    success: false,
    error: errorDef.userMessage,
    errorCode: errorType,
    requestId: req.correlationId,
  });
}

module.exports = { errorHandler, classifyError, USER_MESSAGES };
