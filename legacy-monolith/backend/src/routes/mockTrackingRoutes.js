const express = require('express');
const MockTrackingController = require('../controllers/mockTrackingController');

const router = express.Router();

router.post('/tracking/bootstrap', MockTrackingController.bootstrapTracking);
router.get('/tracking/live', MockTrackingController.getTrackingLive);
router.get('/tracking/trip/:id', MockTrackingController.getTrackingTrip);

router.get('/vehicles', MockTrackingController.listVehicles);
router.get('/vehicle/:id/location', MockTrackingController.getVehicleLocation);
router.get('/vehicle/:id/route', MockTrackingController.getVehicleRoute);

router.post('/trip/start', MockTrackingController.startTrip);
router.post('/trip/end', MockTrackingController.endTrip);

router.get('/trip/:id/progress', MockTrackingController.getTripProgress);
router.get('/trip/:id/distance', MockTrackingController.getTripDistance);
router.get('/trip/:id/eta', MockTrackingController.getTripEta);
router.get('/trip/:id/history', MockTrackingController.getTripHistory);
router.get('/trip/:id/fuel', MockTrackingController.getTripFuel);

module.exports = router;
