const express = require('express');
const IntelligenceController = require('../controllers/intelligenceController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(verifyToken);

router.get('/bookings', IntelligenceController.listBookings);
router.get('/fuel/anomalies', IntelligenceController.getFuelAnomalies);
router.get('/backhaul/suggestions', IntelligenceController.getBackhaulSuggestions);
router.get('/alerts', IntelligenceController.listAlerts);
router.post('/alerts/evaluate', IntelligenceController.evaluateAlerts);
router.get('/ml/models', IntelligenceController.getMlModelCatalog);

module.exports = router;
