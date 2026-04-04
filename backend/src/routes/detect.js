const { Router } = require('express');
const { validateRequest, detectFormatSchema } = require('../middleware/validation');
const { handleDetectFormat } = require('../controllers/detectController');
const router = Router();
router.post('/detect-format', validateRequest(detectFormatSchema), handleDetectFormat);
module.exports = router;
