const { Router } = require('express');
const { validateRequest, exportSchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/authMiddleware');
const { handleExport } = require('../controllers/exportController');
const router = Router();
router.post('/export', requireAuth, validateRequest(exportSchema), handleExport);
module.exports = router;
