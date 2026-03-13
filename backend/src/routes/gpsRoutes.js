const express = require('express');
const router = express.Router();
const gpsController = require('../controllers/gpsController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/fleet/live', authorizeRoles('admin', 'manager'), gpsController.getLiveFleetSnapshot);
router.get('/trips/:tripId/live', gpsController.getTripLiveSnapshot);
router.post('/mock/tick', authorizeRoles('admin', 'manager'), gpsController.runMockTick);
router.post('/', authorizeRoles('admin', 'manager'), gpsController.logGpsData);

module.exports = router;
