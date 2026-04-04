const { Router } = require('express');
const { validateRequest, exportSchema } = require('../middleware/validation');
const { handleExport } = require('../controllers/exportController');
const router = Router();
router.post('/export', validateRequest(exportSchema), handleExport);
module.exports = router;
