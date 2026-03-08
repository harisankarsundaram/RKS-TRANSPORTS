const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// All expense routes require authentication
router.use(verifyToken);

// Admin-only: Add expense
router.post('/', authorizeRoles('admin'), expenseController.addExpense);

// Admin-only: Delete expense
router.delete('/:id', authorizeRoles('admin'), expenseController.deleteExpense);

// Admin-only: Get all expenses (with filters)
router.get('/', authorizeRoles('admin'), expenseController.getAll);

// Admin-only: Get expenses for a specific trip
router.get('/trip/:tripId', authorizeRoles('admin'), expenseController.getByTrip);

// Admin-only: Get category-wise summary
router.get('/summary', authorizeRoles('admin'), expenseController.getCategorySummary);

module.exports = router;
