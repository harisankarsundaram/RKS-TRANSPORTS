const pool = require('../config/db');

const InvoiceModel = {
    // Create new invoice
    async create(data) {
        const { trip_id, invoice_number, invoice_date, due_date, subtotal, gst_amount, total_amount } = data;
        const result = await pool.query(
            `INSERT INTO invoices (trip_id, invoice_number, invoice_date, due_date, subtotal, gst_amount, total_amount, payment_status, amount_paid, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', 0, NOW()) RETURNING *`,
            [trip_id, invoice_number, invoice_date, due_date, subtotal, gst_amount, total_amount]
        );
        return result.rows[0];
    },

    // Get invoice by trip ID
    async getByTripId(tripId) {
        const result = await pool.query(
            `SELECT * FROM invoices WHERE trip_id = $1`,
            [tripId]
        );
        return result.rows[0] || null;
    },

    // Get invoice by ID
    async getById(invoiceId) {
        const result = await pool.query(
            `SELECT i.*, t.lr_number, t.source, t.destination, tr.truck_number, d.name as driver_name
             FROM invoices i
             JOIN trips t ON i.trip_id = t.trip_id
             JOIN trucks tr ON t.truck_id = tr.truck_id
             JOIN drivers d ON t.driver_id = d.driver_id
             WHERE i.invoice_id = $1`,
            [invoiceId]
        );
        return result.rows[0] || null;
    },

    // Get all invoices with joins and optional filters
    async getAll(filters = {}) {
        let query = `
            SELECT i.*, t.lr_number, t.source, t.destination, tr.truck_number, d.name as driver_name
            FROM invoices i
            JOIN trips t ON i.trip_id = t.trip_id
            JOIN trucks tr ON t.truck_id = tr.truck_id
            JOIN drivers d ON t.driver_id = d.driver_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (filters.payment_status) {
            query += ` AND i.payment_status = $${paramIndex}`;
            params.push(filters.payment_status);
            paramIndex++;
        }

        if (filters.dateFrom) {
            query += ` AND i.invoice_date >= $${paramIndex}`;
            params.push(filters.dateFrom);
            paramIndex++;
        }

        if (filters.dateTo) {
            query += ` AND i.invoice_date <= $${paramIndex}`;
            params.push(filters.dateTo);
            paramIndex++;
        }

        query += ` ORDER BY i.created_at DESC`;

        const result = await pool.query(query, params);
        return result.rows;
    },

    // Record a payment against an invoice
    async recordPayment(invoiceId, amount) {
        // First get the current invoice state
        const invoice = await this.getById(invoiceId);
        if (!invoice) return null;

        const newAmountPaid = parseFloat(invoice.amount_paid) + parseFloat(amount);
        const totalAmount = parseFloat(invoice.total_amount);

        let newStatus = 'Partial';
        if (newAmountPaid <= 0) newStatus = 'Pending';
        else if (newAmountPaid >= totalAmount) newStatus = 'Paid';

        const result = await pool.query(
            `UPDATE invoices 
             SET amount_paid = $1, payment_status = $2 
             WHERE invoice_id = $3 
             RETURNING *`,
            [newAmountPaid, newStatus, invoiceId]
        );
        return result.rows[0] || null;
    },

    // Dashboard: Get revenue and outstanding totals
    async getDashboardTotals() {
        const result = await pool.query(`
            SELECT 
                COALESCE(SUM(total_amount), 0) as total_invoiced,
                COALESCE(SUM(amount_paid), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN payment_status != 'Paid' THEN total_amount - amount_paid ELSE 0 END), 0) as total_outstanding,
                COUNT(*) as total_invoices,
                COUNT(CASE WHEN payment_status = 'Pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN payment_status = 'Partial' THEN 1 END) as partial_count,
                COUNT(CASE WHEN payment_status = 'Paid' THEN 1 END) as paid_count
            FROM invoices
        `);
        return result.rows[0];
    }
};

module.exports = InvoiceModel;
