const { Router } = require('express');
const { validateRequest, normalizeSchema } = require('../middleware/validation');
const { handleNormalize } = require('../controllers/normalizeController');
const router = Router();
router.post('/normalize', validateRequest(normalizeSchema), handleNormalize);
module.exports = router;
