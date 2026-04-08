const { Router } = require('express');
const { validateRequest, getSheetsSchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/authMiddleware');
const { handleGetSheets } = require('../controllers/sheetsController');
const router = Router();
router.post('/get-sheets', requireAuth, validateRequest(getSheetsSchema), handleGetSheets);
module.exports = router;
