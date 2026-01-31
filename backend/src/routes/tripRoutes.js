const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const { verifyToken } = require('../middleware/authMiddleware');

// Protect all routes
router.use(verifyToken);

// Trip CRUD operations
router.post('/', tripController.createTrip);
router.get('/', tripController.getAllTrips); // Supports query params: ?status=Running&driver=5&truck=3&dateFrom=2024-01-01&dateTo=2024-01-31
router.get('/:id', tripController.getTripById);
router.put('/:id', tripController.updateTrip);

// Trip status operations
router.post('/:id/start', tripController.startTrip);
router.post('/:id/end', tripController.endTrip);
router.post('/:id/cancel', tripController.cancelTrip);

// Trip analytics and history
router.get('/analytics/summary', tripController.getTripAnalytics); // Supports query params: ?driver=5&truck=3&dateFrom=2024-01-01&dateTo=2024-01-31
router.get('/driver/:driverId/trips', tripController.getTripsByDriver);
router.get('/driver/:driverId/history', tripController.getDriverTripHistory);
router.get('/truck/:truckId/trips', tripController.getTripsByTruck);

module.exports = router;
