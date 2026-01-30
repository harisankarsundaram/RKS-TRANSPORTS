const express = require('express');
const router = express.Router();
const fuelController = require('../controllers/fuelController');

router.post('/', fuelController.logFuel);

module.exports = router;
