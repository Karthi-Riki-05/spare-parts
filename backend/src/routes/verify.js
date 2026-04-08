const { Router } = require('express');
const { validateRequest, verifySchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/authMiddleware');
const { handleVerify } = require('../controllers/verifyController');
const router = Router();
router.post('/verify', requireAuth, validateRequest(verifySchema), handleVerify);
module.exports = router;
