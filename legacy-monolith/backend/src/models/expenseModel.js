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

    // Get operational totals by combining manual expenses + fuel tracking + maintenance logs
    async getOperationalGlobalTotals() {
        const result = await pool.query(`
            WITH manual AS (
                SELECT
                    COALESCE(SUM(amount), 0) AS total,
                    COUNT(*) AS entries
                FROM expenses
                WHERE UPPER(COALESCE(category, '')) NOT IN ('FUEL', 'MAINTENANCE')
            ),
            fuel AS (
                SELECT
                    COALESCE(SUM(total_cost), 0) AS total,
                    COUNT(*) AS entries
                FROM fuel_logs
            ),
            maintenance AS (
                SELECT
                    COALESCE(SUM(cost), 0) AS total,
                    COUNT(*) AS entries
                FROM maintenance
            )
            SELECT
                COALESCE(m.total, 0) + COALESCE(f.total, 0) + COALESCE(mt.total, 0) AS total_expenses,
                COALESCE(m.entries, 0) + COALESCE(f.entries, 0) + COALESCE(mt.entries, 0) AS total_entries,
                COALESCE(m.total, 0) AS managed_expenses,
                COALESCE(f.total, 0) AS fuel_tracking_expenses,
                COALESCE(mt.total, 0) AS maintenance_expenses
            FROM manual m
            CROSS JOIN fuel f
            CROSS JOIN maintenance mt
        `);

        return result.rows[0];
    },

    // Monthly expense trends (last 6 months)
    async getMonthlyTrends() {
        const result = await pool.query(`
            WITH month_bucket AS (
                SELECT (DATE_TRUNC('month', NOW()) - (gs.month_offset * INTERVAL '1 month'))::date AS month_start
                FROM generate_series(5, 0, -1) AS gs(month_offset)
            ),
            manual_agg AS (
                SELECT
                    DATE_TRUNC('month', created_at)::date AS month_start,
                    COALESCE(SUM(amount), 0) AS total,
                    COUNT(*) AS entries
                FROM expenses
                WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
                  AND UPPER(COALESCE(category, '')) NOT IN ('FUEL', 'MAINTENANCE')
                GROUP BY DATE_TRUNC('month', created_at)::date
            ),
            fuel_agg AS (
                SELECT
                    DATE_TRUNC('month', COALESCE(timestamp, created_at, NOW()))::date AS month_start,
                    COALESCE(SUM(total_cost), 0) AS total,
                    COUNT(*) AS entries
                FROM fuel_logs
                WHERE COALESCE(timestamp, created_at, NOW()) >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
                GROUP BY DATE_TRUNC('month', COALESCE(timestamp, created_at, NOW()))::date
            ),
            maintenance_agg AS (
                SELECT
                    DATE_TRUNC('month', COALESCE(created_at, service_date::timestamp, NOW()))::date AS month_start,
                    COALESCE(SUM(cost), 0) AS total,
                    COUNT(*) AS entries
                FROM maintenance
                WHERE COALESCE(created_at, service_date::timestamp, NOW()) >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
                GROUP BY DATE_TRUNC('month', COALESCE(created_at, service_date::timestamp, NOW()))::date
            )
            SELECT
                TO_CHAR(mb.month_start, 'YYYY-MM') AS month,
                TO_CHAR(mb.month_start, 'Mon') AS month_label,
                (
                    COALESCE(ma.total, 0) +
                    COALESCE(fa.total, 0) +
                    COALESCE(mta.total, 0)
                ) AS total,
                (
                    COALESCE(ma.entries, 0) +
                    COALESCE(fa.entries, 0) +
                    COALESCE(mta.entries, 0)
                ) AS entries
            FROM month_bucket mb
            LEFT JOIN manual_agg ma ON ma.month_start = mb.month_start
            LEFT JOIN fuel_agg fa ON fa.month_start = mb.month_start
            LEFT JOIN maintenance_agg mta ON mta.month_start = mb.month_start
            ORDER BY mb.month_start
        `);
        return result.rows;
    },

    // Category breakdown for dashboard
    async getCategoryBreakdown() {
        const result = await pool.query(`
            WITH manual AS (
                SELECT
                    category,
                    COALESCE(SUM(amount), 0) AS total,
                    COUNT(*) AS count
                FROM expenses
                WHERE UPPER(COALESCE(category, '')) NOT IN ('FUEL', 'MAINTENANCE')
                GROUP BY category
            ),
            fuel AS (
                SELECT
                    'Fuel Tracking'::text AS category,
                    COALESCE(SUM(total_cost), 0) AS total,
                    COUNT(*) AS count
                FROM fuel_logs
            ),
            maintenance AS (
                SELECT
                    'Maintenance Service'::text AS category,
                    COALESCE(SUM(cost), 0) AS total,
                    COUNT(*) AS count
                FROM maintenance
            )
            SELECT category, total, count
            FROM (
                SELECT category, total, count FROM manual
                UNION ALL
                SELECT category, total, count FROM fuel
                UNION ALL
                SELECT category, total, count FROM maintenance
            ) merged
            WHERE COALESCE(total, 0) > 0
            ORDER BY total DESC
        `);
        return result.rows;
    }
};

module.exports = ExpenseModel;
