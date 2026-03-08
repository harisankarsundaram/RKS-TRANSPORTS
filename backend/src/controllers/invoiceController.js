const InvoiceModel = require('../models/invoiceModel');
const TripModel = require('../models/tripModel');
const ExpenseModel = require('../models/expenseModel');
const FinanceService = require('../services/financeService');

const InvoiceController = {
    // POST /api/invoices - Generate invoice for a completed trip
    async createInvoice(req, res, next) {
        try {
            const { trip_id, due_date } = req.body;

            if (!trip_id || !due_date) {
                return res.status(400).json({ success: false, message: 'Missing required fields: trip_id, due_date' });
            }

            // Validate trip exists and is completed
            const trip = await TripModel.getById(trip_id);
            if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

            if (trip.status !== 'Completed') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot generate invoice for trip with status '${trip.status}'. Only Completed trips can be invoiced.`
                });
            }

            // Check if invoice already exists for this trip
            const existing = await InvoiceModel.getByTripId(trip_id);
            if (existing) {
                return res.status(409).json({ success: false, message: 'Invoice already exists for this trip', data: existing });
            }

            // Use finance service to calculate amounts
            const { subtotal, gst_amount, total_amount } = FinanceService.calculateInvoiceAmounts(trip);
            const invoice_number = FinanceService.generateInvoiceNumber(trip_id);
            const invoice_date = new Date().toISOString().split('T')[0]; // today

            const invoice = await InvoiceModel.create({
                trip_id,
                invoice_number,
                invoice_date,
                due_date,
                subtotal,
                gst_amount,
                total_amount
            });

            // Also calculate profit for the response
            const expenseTotal = await ExpenseModel.getTotalByTrip(trip_id);
            const internalCost = FinanceService.calculateInternalCost(trip, expenseTotal);
            const profit = FinanceService.calculateProfit(total_amount, internalCost);

            res.status(201).json({
                success: true,
                message: 'Invoice generated successfully',
                data: {
                    ...invoice,
                    internal_cost: internalCost,
                    profit
                }
            });
        } catch (error) {
            next(error);
        }
    },

    // POST /api/invoices/:id/payment - Record payment
    async recordPayment(req, res, next) {
        try {
            const { id } = req.params;
            const { amount } = req.body;

            if (!amount || parseFloat(amount) <= 0) {
                return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });
            }

            const invoice = await InvoiceModel.getById(id);
            if (!invoice) {
                return res.status(404).json({ success: false, message: 'Invoice not found' });
            }

            if (invoice.payment_status === 'Paid') {
                return res.status(400).json({ success: false, message: 'Invoice is already fully paid' });
            }

            const updated = await InvoiceModel.recordPayment(id, amount);

            res.json({
                success: true,
                message: `Payment of ₹${amount} recorded successfully`,
                data: updated
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/invoices - Get all invoices
    async getAllInvoices(req, res, next) {
        try {
            const filters = {
                payment_status: req.query.status,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

            const invoices = await InvoiceModel.getAll(filters);
            res.json({ success: true, count: invoices.length, data: invoices });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/invoices/:id - Get single invoice with profit
    async getInvoiceById(req, res, next) {
        try {
            const { id } = req.params;
            const invoice = await InvoiceModel.getById(id);

            if (!invoice) {
                return res.status(404).json({ success: false, message: 'Invoice not found' });
            }

            // Calculate profit
            const trip = await TripModel.getById(invoice.trip_id);
            const expenseTotal = await ExpenseModel.getTotalByTrip(invoice.trip_id);
            const internalCost = FinanceService.calculateInternalCost(trip, expenseTotal);
            const profit = FinanceService.calculateProfit(invoice.total_amount, internalCost);

            res.json({
                success: true,
                data: {
                    ...invoice,
                    internal_cost: internalCost,
                    profit
                }
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/invoices/dashboard - Dashboard KPIs
    async getDashboardKPIs(req, res, next) {
        try {
            const invoiceTotals = await InvoiceModel.getDashboardTotals();
            const expenseTotals = await ExpenseModel.getGlobalTotals();

            const totalRevenue = parseFloat(invoiceTotals.total_revenue) || 0;
            const totalExpenses = parseFloat(expenseTotals.total_expenses) || 0;
            const netProfit = FinanceService.calculateProfit(totalRevenue, totalExpenses);

            res.json({
                success: true,
                data: {
                    total_invoiced: invoiceTotals.total_invoiced,
                    total_revenue: totalRevenue,
                    total_outstanding: invoiceTotals.total_outstanding,
                    total_expenses: totalExpenses,
                    net_profit: netProfit,
                    invoice_counts: {
                        total: invoiceTotals.total_invoices,
                        pending: invoiceTotals.pending_count,
                        partial: invoiceTotals.partial_count,
                        paid: invoiceTotals.paid_count
                    }
                }
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = InvoiceController;
