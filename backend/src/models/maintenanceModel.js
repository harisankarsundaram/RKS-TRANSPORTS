const pool = require('../config/db');

const MaintenanceModel = {
    async create(data) {
        const { truck_id, service_date, description, cost } = data;
        const [result] = await pool.execute(
            `INSERT INTO maintenance (truck_id, service_date, description, cost, created_at) 
             VALUES (?, ?, ?, ?, NOW())`,
            [truck_id, service_date, description, cost]
        );
        return result.insertId;
    },

    async getAll() {
        const [rows] = await pool.execute(
            `SELECT m.*, t.truck_number 
             FROM maintenance m
             JOIN trucks t ON m.truck_id = t.truck_id
             ORDER BY m.service_date DESC`
        );
        return rows;
    }
};

module.exports = MaintenanceModel;
