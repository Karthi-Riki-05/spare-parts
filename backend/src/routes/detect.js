const { Router } = require('express');
const { validateRequest, detectFormatSchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/authMiddleware');
const { handleDetectFormat } = require('../controllers/detectController');
const router = Router();
router.post('/detect-format', requireAuth, validateRequest(detectFormatSchema), handleDetectFormat);
module.exports = router;
