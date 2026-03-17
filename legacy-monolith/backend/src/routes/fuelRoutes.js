const express = require('express');
const router = express.Router();
const fuelController = require('../controllers/fuelController');
const { verifyToken } = require('../middleware/authMiddleware');

// Protect all routes
router.use(verifyToken);

// Fuel analytics (before parameterized routes)
router.get('/trip/:tripId/logs', fuelController.getFuelLogsByTrip);
router.get('/trip/:tripId/summary', fuelController.getTripFuelSummary);
router.get('/analytics/truck/:truckId', fuelController.getTruckFuelAnalytics);
router.get('/analytics/driver/:driverId', fuelController.getDriverFuelAnalytics);

// Fuel CRUD operations
router.post('/', fuelController.logFuel);
router.get('/', fuelController.getAllFuelLogs);
router.get('/:id', fuelController.getFuelLogById);
router.put('/:id', fuelController.updateFuelLog);
router.delete('/:id', fuelController.deleteFuelLog);

module.exports = router;
