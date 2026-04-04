const { Router } = require('express');
const { validateRequest, manualMapSchema } = require('../middleware/validation');
const { handleManualMap } = require('../controllers/manualMapController');
const router = Router();
router.post('/manual-map', validateRequest(manualMapSchema), handleManualMap);
module.exports = router;
