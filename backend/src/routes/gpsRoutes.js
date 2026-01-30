const express = require('express');
const router = express.Router();
const gpsController = require('../controllers/gpsController');

router.post('/', gpsController.logGpsData);

module.exports = router;
