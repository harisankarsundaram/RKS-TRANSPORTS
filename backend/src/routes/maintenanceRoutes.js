const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenanceController');

router.post('/', maintenanceController.logMaintenance);
router.get('/', maintenanceController.getAllMaintenance);

module.exports = router;
