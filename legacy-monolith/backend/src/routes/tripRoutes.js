const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const { verifyToken } = require('../middleware/authMiddleware');

// Protect all routes
router.use(verifyToken);

// Trip analytics and history (MUST be before /:id to avoid route conflict)
router.get('/analytics/summary', tripController.getTripAnalytics);
router.get('/driver/:driverId/trips', tripController.getTripsByDriver);
router.get('/driver/:driverId/history', tripController.getDriverTripHistory);
router.get('/truck/:truckId/trips', tripController.getTripsByTruck);

// Trip CRUD operations
router.post('/', tripController.createTrip);
router.get('/', tripController.getAllTrips);
router.get('/:id', tripController.getTripById);
router.put('/:id', tripController.updateTrip);

// Trip status operations
router.post('/:id/start', tripController.startTrip);
router.post('/:id/end', tripController.endTrip);
router.post('/:id/cancel', tripController.cancelTrip);

module.exports = router;
