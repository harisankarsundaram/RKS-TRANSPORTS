const pool = require('../config/db');

const MaintenanceModel = {
    async create(data) {
        const { truck_id, service_date, description, cost } = data;
        const result = await pool.query(
            `INSERT INTO maintenance (truck_id, service_date, description, cost, created_at) 
             VALUES ($1, $2, $3, $4, NOW()) RETURNING maintenance_id`,
            [truck_id, service_date, description, cost]
        );
        return result.rows[0].maintenance_id;
    },

    async getAll() {
        const result = await pool.query(
            `SELECT m.*, t.truck_number 
             FROM maintenance m
             JOIN trucks t ON m.truck_id = t.truck_id
             ORDER BY m.service_date DESC`
        );
        return result.rows;
    }
};

module.exports = MaintenanceModel;
