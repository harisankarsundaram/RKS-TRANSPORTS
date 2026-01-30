const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');

router.post('/', tripController.createTrip);
router.post('/:id/start', tripController.startTrip);
router.post('/:id/end', tripController.endTrip);
router.get('/', tripController.getAllTrips);
router.get('/:id', tripController.getTripById);

module.exports = router;
