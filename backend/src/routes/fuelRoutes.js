const express = require('express');
const router = express.Router();
const fuelController = require('../controllers/fuelController');

// Fuel CRUD operations
router.post('/', fuelController.logFuel);
router.get('/', fuelController.getAllFuelLogs); // Supports query params: ?trip=5&dateFrom=2024-01-01&dateTo=2024-01-31
router.get('/:id', fuelController.getFuelLogById);
router.put('/:id', fuelController.updateFuelLog);
router.delete('/:id', fuelController.deleteFuelLog);

// Fuel analytics and summaries
router.get('/trip/:tripId/logs', fuelController.getFuelLogsByTrip);
router.get('/trip/:tripId/summary', fuelController.getTripFuelSummary);
router.get('/analytics/truck/:truckId', fuelController.getTruckFuelAnalytics); // Supports query params: ?dateFrom=2024-01-01&dateTo=2024-01-31
router.get('/analytics/driver/:driverId', fuelController.getDriverFuelAnalytics); // Supports query params: ?dateFrom=2024-01-01&dateTo=2024-01-31

module.exports = router;
