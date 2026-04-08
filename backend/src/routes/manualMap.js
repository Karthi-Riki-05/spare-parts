const { Router } = require('express');
const { validateRequest, manualMapSchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/authMiddleware');
const { handleManualMap } = require('../controllers/manualMapController');
const router = Router();
router.post('/manual-map', requireAuth, validateRequest(manualMapSchema), handleManualMap);
module.exports = router;
