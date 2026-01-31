const pool = require('../config/db');

const FuelModel = {
    async create(fuelData) {
        const { trip_id, liters, price_per_liter, total_cost } = fuelData;
        const result = await pool.query(
            `INSERT INTO fuel_logs (trip_id, liters, price_per_liter, total_cost, created_at) 
             VALUES ($1, $2, $3, $4, NOW()) RETURNING fuel_id`,
            [trip_id, liters, price_per_liter, total_cost]
        );
        return result.rows[0].fuel_id;
    }
};

module.exports = FuelModel;
