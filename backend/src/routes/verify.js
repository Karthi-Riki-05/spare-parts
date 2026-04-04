const { Router } = require('express');
const { validateRequest, verifySchema } = require('../middleware/validation');
const { handleVerify } = require('../controllers/verifyController');
const router = Router();
router.post('/verify', validateRequest(verifySchema), handleVerify);
module.exports = router;
