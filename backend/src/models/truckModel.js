const pool = require('../config/db');

const TruckModel = {
    // Create a new truck
    async create(truckData) {
        const { truck_number, capacity, status, insurance_expiry, fitness_expiry } = truckData;
        const [result] = await pool.execute(
            `INSERT INTO trucks (truck_number, capacity, status, insurance_expiry, fitness_expiry) 
             VALUES (?, ?, ?, ?, ?)`,
            [truck_number, capacity, status || 'Available', insurance_expiry, fitness_expiry]
        );
        return { truck_id: result.insertId, ...truckData };
    },

    // Get all trucks (excluding soft deleted)
    async getAll() {
        const [rows] = await pool.execute(
            'SELECT * FROM trucks WHERE deleted_at IS NULL ORDER BY created_at DESC'
        );
        return rows;
    },

    // Get truck by ID
    async getById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM trucks WHERE truck_id = ? AND deleted_at IS NULL',
            [id]
        );
        return rows[0] || null;
    },

    // Check if truck number exists (for validation)
    async findByTruckNumber(truck_number, excludeId = null) {
        let query = 'SELECT * FROM trucks WHERE truck_number = ? AND deleted_at IS NULL';
        let params = [truck_number];

        if (excludeId) {
            query += ' AND truck_id != ?';
            params.push(excludeId);
        }

        const [rows] = await pool.execute(query, params);
        return rows[0] || null;
    },

    // Update truck
    async update(id, updateData) {
        const fields = [];
        const values = [];

        const allowedFields = ['truck_number', 'capacity', 'status', 'insurance_expiry', 'fitness_expiry'];

        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(updateData[field]);
            }
        }

        if (fields.length === 0) {
            return null;
        }

        values.push(id);

        const [result] = await pool.execute(
            `UPDATE trucks SET ${fields.join(', ')} WHERE truck_id = ? AND deleted_at IS NULL`,
            values
        );

        return result.affectedRows > 0;
    },

    // Update truck status
    async updateStatus(id, status) {
        const [result] = await pool.execute(
            'UPDATE trucks SET status = ? WHERE truck_id = ? AND deleted_at IS NULL',
            [status, id]
        );
        return result.affectedRows > 0;
    },

    // Soft delete truck
    async delete(id) {
        const [result] = await pool.execute(
            'UPDATE trucks SET deleted_at = CURRENT_TIMESTAMP WHERE truck_id = ? AND deleted_at IS NULL',
            [id]
        );
        return result.affectedRows > 0;
    },

    // Check if truck has assigned driver
    async hasAssignedDriver(truckId) {
        const [rows] = await pool.execute(
            'SELECT driver_id FROM drivers WHERE assigned_truck_id = ? AND deleted_at IS NULL',
            [truckId]
        );
        return rows.length > 0;
    },

    // Get assigned driver ID
    async getAssignedDriver(truckId) {
        const [rows] = await pool.execute(
            'SELECT driver_id FROM drivers WHERE assigned_truck_id = ? AND deleted_at IS NULL',
            [truckId]
        );
        return rows[0] ? rows[0].driver_id : null;
    }
};

module.exports = TruckModel;
