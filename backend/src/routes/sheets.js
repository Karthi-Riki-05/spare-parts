const { Router } = require('express');
const { validateRequest, getSheetsSchema } = require('../middleware/validation');
const { handleGetSheets } = require('../controllers/sheetsController');
const router = Router();
router.post('/get-sheets', validateRequest(getSheetsSchema), handleGetSheets);
module.exports = router;
