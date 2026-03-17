const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// All invoice routes require authentication
router.use(verifyToken);

// Dashboard KPIs (must be before /:id to avoid route conflict)
router.get('/dashboard', authorizeRoles('admin'), invoiceController.getDashboardKPIs);

// Invoice CRUD
router.post('/', authorizeRoles('admin'), invoiceController.createInvoice);
router.get('/', authorizeRoles('admin'), invoiceController.getAllInvoices);
router.get('/:id', authorizeRoles('admin'), invoiceController.getInvoiceById);

// Payment recording
router.post('/:id/payment', authorizeRoles('admin'), invoiceController.recordPayment);

module.exports = router;
