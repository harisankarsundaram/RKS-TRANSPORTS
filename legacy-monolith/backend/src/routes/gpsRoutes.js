const express = require('express');
const router = express.Router();
const gpsController = require('../controllers/gpsController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.post('/', authorizeRoles('admin', 'manager'), gpsController.logGpsData);

module.exports = router;
