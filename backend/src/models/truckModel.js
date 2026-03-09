const pool = require('../config/db');

const TruckModel = {
    // Create a new truck
    async create(truckData) {
        const { truck_number, capacity, status, insurance_expiry, fitness_expiry } = truckData;
        const result = await pool.query(
            `INSERT INTO trucks (truck_number, capacity, status, insurance_expiry, fitness_expiry) 
             VALUES ($1, $2, $3, $4, $5) RETURNING truck_id`,
            [truck_number, capacity, status || 'Available', insurance_expiry, fitness_expiry]
        );
        return { truck_id: result.rows[0].truck_id, ...truckData };
    },

    // Get all trucks (excluding soft deleted)
    async getAll() {
        const result = await pool.query(
            'SELECT * FROM trucks WHERE deleted_at IS NULL ORDER BY created_at DESC'
        );
        return result.rows;
    },

    // Get truck by ID
    async getById(id) {
        const result = await pool.query(
            'SELECT * FROM trucks WHERE truck_id = $1 AND deleted_at IS NULL',
            [id]
        );
        return result.rows[0] || null;
    },

    async getAvailableCount() {
        const result = await pool.query("SELECT COUNT(*) FROM trucks WHERE status = 'Available' AND deleted_at IS NULL");
        return parseInt(result.rows[0].count);
    },

    // Status breakdown for dashboard
    async getStatusBreakdown() {
        const result = await pool.query(`
            SELECT status, COUNT(*) as count
            FROM trucks WHERE deleted_at IS NULL
            GROUP BY status
        `);
        const breakdown = { Available: 0, Assigned: 0, Maintenance: 0 };
        result.rows.forEach(r => { breakdown[r.status] = parseInt(r.count); });
        breakdown.total = Object.values(breakdown).reduce((a, b) => a + b, 0);
        return breakdown;
    },

    // Check if truck number exists (for validation)
    async findByTruckNumber(truck_number, excludeId = null) {
        let query = 'SELECT * FROM trucks WHERE truck_number = $1 AND deleted_at IS NULL';
        let params = [truck_number];

        if (excludeId) {
            query += ' AND truck_id != $2';
            params.push(excludeId);
        }

        const result = await pool.query(query, params);
        return result.rows[0] || null;
    },

    // Update truck
    async update(id, updateData) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        const allowedFields = ['truck_number', 'capacity', 'status', 'insurance_expiry', 'fitness_expiry'];

        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                fields.push(`${field} = $${paramIndex}`);
                values.push(updateData[field]);
                paramIndex++;
            }
        }

        if (fields.length === 0) {
            return null;
        }

        values.push(id);

        const result = await pool.query(
            `UPDATE trucks SET ${fields.join(', ')} WHERE truck_id = $${paramIndex} AND deleted_at IS NULL`,
            values
        );

        return result.rowCount > 0;
    },

    // Update truck status
    async updateStatus(id, status) {
        const result = await pool.query(
            'UPDATE trucks SET status = $1 WHERE truck_id = $2 AND deleted_at IS NULL',
            [status, id]
        );
        return result.rowCount > 0;
    },

    // Soft delete truck
    async delete(id) {
        const result = await pool.query(
            'UPDATE trucks SET deleted_at = NOW() WHERE truck_id = $1 AND deleted_at IS NULL',
            [id]
        );
        return result.rowCount > 0;
    },

    // Check if truck has assigned driver
    async hasAssignedDriver(truckId) {
        const result = await pool.query(
            'SELECT driver_id FROM drivers WHERE assigned_truck_id = $1 AND deleted_at IS NULL',
            [truckId]
        );
        return result.rows.length > 0;
    },

    // Get assigned driver ID
    async getAssignedDriver(truckId) {
        const result = await pool.query(
            'SELECT driver_id FROM drivers WHERE assigned_truck_id = $1 AND deleted_at IS NULL',
            [truckId]
        );
        return result.rows[0] ? result.rows[0].driver_id : null;
    }
};

module.exports = TruckModel;
