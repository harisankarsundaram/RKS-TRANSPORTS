const InvoiceModel = require('../models/invoiceModel');
const TripModel = require('../models/tripModel');

const InvoiceController = {
    // POST /api/invoice
    async createInvoice(req, res, next) {
        try {
            const { trip_id, total_amount, advance_amount, payment_status, invoice_date } = req.body;

            if (!trip_id || !total_amount || !invoice_date) {
                return res.status(400).json({ success: false, message: 'Missing fields' });
            }

            const trip = await TripModel.getById(trip_id);
            if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

            // Only allow invoicing for completed trips
            if (trip.status !== 'Completed') {
                return res.status(400).json({ success: false, message: 'Cannot generate invoice for incomplete trip' });
            }

            const adv = parseFloat(advance_amount || 0);
            const total = parseFloat(total_amount);
            const balance = total - adv;

            await InvoiceModel.create({
                trip_id,
                total_amount: total,
                advance_amount: adv,
                balance_amount: balance,
                payment_status: payment_status || 'Pending',
                invoice_date
            });

            res.status(201).json({
                success: true,
                message: 'Invoice generated',
                data: { total, advance: adv, balance }
            });

        } catch (error) {
            next(error);
        }
    },

    // GET /api/invoice
    async getAllInvoices(req, res, next) {
        try {
            const invoices = await InvoiceModel.getAll();
            res.json({ success: true, data: invoices });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = InvoiceController;
