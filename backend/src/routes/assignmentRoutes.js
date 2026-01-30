const express = require('express');
const router = express.Router();
const AssignmentController = require('../controllers/assignmentController');

// POST /api/assign-driver - Assign driver to truck
router.post('/assign-driver', AssignmentController.assignDriver);

// POST /api/unassign-driver - Unassign driver from truck
router.post('/unassign-driver', AssignmentController.unassignDriver);

module.exports = router;
