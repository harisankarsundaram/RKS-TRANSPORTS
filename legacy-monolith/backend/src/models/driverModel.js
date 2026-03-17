const pool = require('../config/db');

const DriverModel = {
    // Create a new driver
    async create(driverData) {
        const { name, phone, license_number, license_expiry, status } = driverData;
        const result = await pool.query(
            `INSERT INTO drivers (name, phone, license_number, license_expiry, status) 
             VALUES ($1, $2, $3, $4, $5) RETURNING driver_id`,
            [name, phone, license_number, license_expiry, status || 'Available']
        );
        return { driver_id: result.rows[0].driver_id, ...driverData };
    },

    // Get all drivers (excluding soft deleted)
    async getAll() {
        const result = await pool.query(
            `SELECT d.*, t.truck_number 
             FROM drivers d 
             LEFT JOIN trucks t ON d.assigned_truck_id = t.truck_id 
             WHERE d.deleted_at IS NULL 
             ORDER BY d.created_at DESC`
        );
        return result.rows;
    },

    // Get driver by ID
    async getById(id) {
        const result = await pool.query(
            `SELECT d.*, t.truck_number 
             FROM drivers d 
             LEFT JOIN trucks t ON d.assigned_truck_id = t.truck_id 
             WHERE d.driver_id = $1 AND d.deleted_at IS NULL`,
            [id]
        );
        return result.rows[0] || null;
    },

    // Get driver by user ID
    async getByUserId(userId) {
        if (!userId || isNaN(Number(userId))) {
            return null;
        }
        const result = await pool.query(
            `SELECT d.*, t.truck_number, t.capacity as truck_capacity
             FROM drivers d 
             LEFT JOIN trucks t ON d.assigned_truck_id = t.truck_id 
             WHERE d.user_id = $1 AND d.deleted_at IS NULL`,
            [userId]
        );
        return result.rows[0] || null;
    },

    // Check if license number exists (for validation)
    async findByLicenseNumber(license_number, excludeId = null) {
        let query = 'SELECT * FROM drivers WHERE license_number = $1 AND deleted_at IS NULL';
        let params = [license_number];

        if (excludeId) {
            query += ' AND driver_id != $2';
            params.push(excludeId);
        }

        const result = await pool.query(query, params);
        return result.rows[0] || null;
    },

    // Update driver
    async update(id, updateData) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        const allowedFields = ['name', 'phone', 'license_number', 'license_expiry', 'status'];

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
            `UPDATE drivers SET ${fields.join(', ')} WHERE driver_id = $${paramIndex} AND deleted_at IS NULL`,
            values
        );

        return result.rowCount > 0;
    },

    // Assign truck to driver
    async assignTruck(driverId, truckId) {
        const result = await pool.query(
            `UPDATE drivers SET assigned_truck_id = $1, status = 'Assigned' 
             WHERE driver_id = $2 AND deleted_at IS NULL`,
            [truckId, driverId]
        );
        return result.rowCount > 0;
    },

    // Unassign truck from driver
    async unassignTruck(driverId) {
        const result = await pool.query(
            `UPDATE drivers SET assigned_truck_id = NULL, status = 'Available' 
             WHERE driver_id = $1 AND deleted_at IS NULL`,
            [driverId]
        );
        return result.rowCount > 0;
    },

    // Soft delete driver
    async delete(id) {
        const result = await pool.query(
            'UPDATE drivers SET deleted_at = NOW() WHERE driver_id = $1 AND deleted_at IS NULL',
            [id]
        );
        return result.rowCount > 0;
    }
};

module.exports = DriverModel;
