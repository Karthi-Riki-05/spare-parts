/**
 * Wraps async route handlers so unhandled rejections are passed to
 * Express error handling middleware (errorHandler.js) instead of
 * crashing the process or returning a raw 500.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
