const { Router } = require('express');
const { validateRequest, normalizeSchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/authMiddleware');
const { handleNormalize } = require('../controllers/normalizeController');
const router = Router();
router.post('/normalize', requireAuth, validateRequest(normalizeSchema), handleNormalize);
module.exports = router;
