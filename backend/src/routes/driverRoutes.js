const express = require('express');
const router = express.Router();
const DriverController = require('../controllers/driverController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// Protect all routes
router.use(verifyToken);

// POST /api/drivers - Create new driver (Admin/Manager only)
router.post('/', authorizeRoles('admin', 'manager'), DriverController.create);

// GET /api/drivers - Get all drivers
router.get('/', DriverController.getAll);

// GET /api/drivers/:id - Get driver by ID
router.get('/:id', DriverController.getById);

// PUT /api/drivers/:id - Update driver (Admin/Manager only)
router.put('/:id', authorizeRoles('admin', 'manager'), DriverController.update);

// DELETE /api/drivers/:id - Soft delete driver (Admin only)
router.delete('/:id', authorizeRoles('admin'), DriverController.delete);

module.exports = router;
