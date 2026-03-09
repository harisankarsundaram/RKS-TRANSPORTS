const pool = require('../config/db');

const ExpenseModel = {
    // Create new expense entry
    async create(data) {
        const { trip_id, truck_id, category, amount, description } = data;
        const result = await pool.query(
            `INSERT INTO expenses (trip_id, truck_id, category, amount, description, created_at) 
             VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
            [trip_id, truck_id || null, category, amount, description || null]
        );
        return result.rows[0];
    },

    // Get all expenses for a specific trip
    async getByTrip(tripId) {
        const result = await pool.query(
            `SELECT * FROM expenses WHERE trip_id = $1 ORDER BY created_at DESC`,
            [tripId]
        );
        return result.rows;
    },

    // Get all expenses for a specific truck
    async getByTruck(truckId) {
        const result = await pool.query(
            `SELECT e.*, t.lr_number 
             FROM expenses e
             LEFT JOIN trips t ON e.trip_id = t.trip_id
             WHERE e.truck_id = $1 
             ORDER BY e.created_at DESC`,
            [truckId]
        );
        return result.rows;
    },

    // Get total expense amount for a specific trip
    async getTotalByTrip(tripId) {
        const result = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE trip_id = $1`,
            [tripId]
        );
        return parseFloat(result.rows[0].total);
    },

    // Get expense totals grouped by category (with optional filters)
    async getTotalByCategory(filters = {}) {
        let query = `
            SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
            FROM expenses
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (filters.trip_id) {
            query += ` AND trip_id = $${paramIndex}`;
            params.push(filters.trip_id);
            paramIndex++;
        }

        if (filters.truck_id) {
            query += ` AND truck_id = $${paramIndex}`;
            params.push(filters.truck_id);
            paramIndex++;
        }

        if (filters.dateFrom) {
            query += ` AND created_at >= $${paramIndex}`;
            params.push(filters.dateFrom);
            paramIndex++;
        }

        if (filters.dateTo) {
            query += ` AND created_at <= $${paramIndex}`;
            params.push(filters.dateTo);
            paramIndex++;
        }

        query += ` GROUP BY category ORDER BY total DESC`;

        const result = await pool.query(query, params);
        return result.rows;
    },

    // Get all expenses with optional filtering and joins
    async getAll(filters = {}) {
        let query = `
            SELECT e.*, t.lr_number, t.source, t.destination, tr.truck_number
            FROM expenses e
            LEFT JOIN trips t ON e.trip_id = t.trip_id
            LEFT JOIN trucks tr ON e.truck_id = tr.truck_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (filters.trip_id) {
            query += ` AND e.trip_id = $${paramIndex}`;
            params.push(filters.trip_id);
            paramIndex++;
        }

        if (filters.truck_id) {
            query += ` AND e.truck_id = $${paramIndex}`;
            params.push(filters.truck_id);
            paramIndex++;
        }

        if (filters.category) {
            query += ` AND e.category = $${paramIndex}`;
            params.push(filters.category);
            paramIndex++;
        }

        if (filters.dateFrom) {
            query += ` AND e.created_at >= $${paramIndex}`;
            params.push(filters.dateFrom);
            paramIndex++;
        }

        if (filters.dateTo) {
            query += ` AND e.created_at <= $${paramIndex}`;
            params.push(filters.dateTo);
            paramIndex++;
        }

        query += ` ORDER BY e.created_at DESC`;

        const result = await pool.query(query, params);
        return result.rows;
    },

    // Get single expense by ID
    async getById(expenseId) {
        const result = await pool.query(
            `SELECT * FROM expenses WHERE expense_id = $1`,
            [expenseId]
        );
        return result.rows[0] || null;
    },

    // Delete expense
    async delete(expenseId) {
        const result = await pool.query(
            `DELETE FROM expenses WHERE expense_id = $1`,
            [expenseId]
        );
        return result.rowCount > 0;
    },

    // Get global expense totals (for dashboard)
    async getGlobalTotals() {
        const result = await pool.query(`
            SELECT 
                COALESCE(SUM(amount), 0) as total_expenses,
                COUNT(*) as total_entries
            FROM expenses
        `);
        return result.rows[0];
    },

    // Monthly expense trends (last 6 months)
    async getMonthlyTrends() {
        const result = await pool.query(`
            SELECT 
                TO_CHAR(created_at, 'YYYY-MM') as month,
                TO_CHAR(created_at, 'Mon') as month_label,
                COALESCE(SUM(amount), 0) as total,
                COUNT(*) as entries
            FROM expenses
            WHERE created_at >= NOW() - INTERVAL '6 months'
            GROUP BY TO_CHAR(created_at, 'YYYY-MM'), TO_CHAR(created_at, 'Mon')
            ORDER BY month
        `);
        return result.rows;
    },

    // Category breakdown for dashboard
    async getCategoryBreakdown() {
        const result = await pool.query(`
            SELECT 
                category,
                COALESCE(SUM(amount), 0) as total,
                COUNT(*) as count
            FROM expenses
            GROUP BY category
            ORDER BY total DESC
        `);
        return result.rows;
    }
};

module.exports = ExpenseModel;
