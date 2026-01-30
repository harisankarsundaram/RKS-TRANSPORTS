const pool = require('../config/db');

const DriverModel = {
    // Create a new driver
    async create(driverData) {
        const { name, phone, license_number, license_expiry, status } = driverData;
        const [result] = await pool.execute(
            `INSERT INTO drivers (name, phone, license_number, license_expiry, status) 
             VALUES (?, ?, ?, ?, ?)`,
            [name, phone, license_number, license_expiry, status || 'Available']
        );
        return { driver_id: result.insertId, ...driverData };
    },

    // Get all drivers (excluding soft deleted)
    async getAll() {
        const [rows] = await pool.execute(
            `SELECT d.*, t.truck_number 
             FROM drivers d 
             LEFT JOIN trucks t ON d.assigned_truck_id = t.truck_id 
             WHERE d.deleted_at IS NULL 
             ORDER BY d.created_at DESC`
        );
        return rows;
    },

    // Get driver by ID
    async getById(id) {
        const [rows] = await pool.execute(
            `SELECT d.*, t.truck_number 
             FROM drivers d 
             LEFT JOIN trucks t ON d.assigned_truck_id = t.truck_id 
             WHERE d.driver_id = ? AND d.deleted_at IS NULL`,
            [id]
        );
        return rows[0] || null;
    },

    // Check if license number exists (for validation)
    async findByLicenseNumber(license_number, excludeId = null) {
        let query = 'SELECT * FROM drivers WHERE license_number = ? AND deleted_at IS NULL';
        let params = [license_number];

        if (excludeId) {
            query += ' AND driver_id != ?';
            params.push(excludeId);
        }

        const [rows] = await pool.execute(query, params);
        return rows[0] || null;
    },

    // Update driver
    async update(id, updateData) {
        const fields = [];
        const values = [];

        const allowedFields = ['name', 'phone', 'license_number', 'license_expiry', 'status'];

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
            `UPDATE drivers SET ${fields.join(', ')} WHERE driver_id = ? AND deleted_at IS NULL`,
            values
        );

        return result.affectedRows > 0;
    },

    // Assign truck to driver
    async assignTruck(driverId, truckId) {
        const [result] = await pool.execute(
            `UPDATE drivers SET assigned_truck_id = ?, status = 'Assigned' 
             WHERE driver_id = ? AND deleted_at IS NULL`,
            [truckId, driverId]
        );
        return result.affectedRows > 0;
    },

    // Unassign truck from driver
    async unassignTruck(driverId) {
        const [result] = await pool.execute(
            `UPDATE drivers SET assigned_truck_id = NULL, status = 'Available' 
             WHERE driver_id = ? AND deleted_at IS NULL`,
            [driverId]
        );
        return result.affectedRows > 0;
    },

    // Soft delete driver
    async delete(id) {
        const [result] = await pool.execute(
            'UPDATE drivers SET deleted_at = CURRENT_TIMESTAMP WHERE driver_id = ? AND deleted_at IS NULL',
            [id]
        );
        return result.affectedRows > 0;
    }
};

module.exports = DriverModel;
