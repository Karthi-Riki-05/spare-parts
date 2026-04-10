const detectionService = require('../services/detectionService');
const { logger } = require('../utils/logger');

async function handleDetectFormat(req, res, next) {
  try {
    const { fileData, sheetIndex = 0 } = req.body;
    logger.info('Detecting format', { correlationId: req.correlationId, sheetIndex });

    const result = await detectionService.processDetection(fileData, sheetIndex, {
      correlationId: req.correlationId
    });

    res.json(result);
  } catch (error) {
    // Return structured 422 for content validation failures
    if (error.status === 422 && error.details) {
      return res.status(422).json(error.details);
    }
    next(error);
  }
}

module.exports = { handleDetectFormat };
