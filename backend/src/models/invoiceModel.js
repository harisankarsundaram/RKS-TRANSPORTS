const pool = require('../config/db');

const InvoiceModel = {
    async create(data) {
        const { trip_id, total_amount, advance_amount, balance_amount, payment_status, invoice_date } = data;
        const [result] = await pool.execute(
            `INSERT INTO invoices (trip_id, total_amount, advance_amount, balance_amount, payment_status, invoice_date, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [trip_id, total_amount, advance_amount, balance_amount, payment_status, invoice_date]
        );
        return result.insertId;
    },

    async getAll() {
        const [rows] = await pool.execute(
            `SELECT i.*, t.lr_number, tr.truck_number 
             FROM invoices i
             JOIN trips t ON i.trip_id = t.trip_id
             JOIN trucks tr ON t.truck_id = tr.truck_id
             ORDER BY i.invoice_date DESC`
        );
        return rows;
    }
};

module.exports = InvoiceModel;
