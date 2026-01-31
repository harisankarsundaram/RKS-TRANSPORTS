const pool = require('../config/db');

const InvoiceModel = {
    async create(data) {
        const { trip_id, total_amount, advance_amount, balance_amount, payment_status, invoice_date } = data;
        const result = await pool.query(
            `INSERT INTO invoices (trip_id, total_amount, advance_amount, balance_amount, payment_status, invoice_date, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING invoice_id`,
            [trip_id, total_amount, advance_amount, balance_amount, payment_status, invoice_date]
        );
        return result.rows[0].invoice_id;
    },

    async getAll() {
        const result = await pool.query(
            `SELECT i.*, t.lr_number, tr.truck_number 
             FROM invoices i
             JOIN trips t ON i.trip_id = t.trip_id
             JOIN trucks tr ON t.truck_id = tr.truck_id
             ORDER BY i.invoice_date DESC`
        );
        return result.rows;
    }
};

module.exports = InvoiceModel;
