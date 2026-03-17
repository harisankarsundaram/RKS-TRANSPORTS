const express = require('express');
const router = express.Router();
const TruckController = require('../controllers/truckController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// Protect all routes
router.use(verifyToken);

// POST /api/trucks - Create new truck (Admin/Manager only)
router.post('/', authorizeRoles('admin', 'manager'), TruckController.create);

// GET /api/trucks - Get all trucks
router.get('/', TruckController.getAll);

// GET /api/trucks/:id - Get truck by ID
router.get('/:id', TruckController.getById);

// PUT /api/trucks/:id - Update truck (Admin/Manager only)
router.put('/:id', authorizeRoles('admin', 'manager'), TruckController.update);

// DELETE /api/trucks/:id - Soft delete truck (Admin only)
router.delete('/:id', authorizeRoles('admin'), TruckController.delete);

module.exports = router;
