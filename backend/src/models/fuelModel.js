const pool = require('../config/db');

const FuelModel = {
    async create(fuelData) {
        const { trip_id, liters, price_per_liter, total_cost } = fuelData;
        const [result] = await pool.execute(
            `INSERT INTO fuel_logs (trip_id, liters, price_per_liter, total_cost, created_at) 
             VALUES (?, ?, ?, ?, NOW())`,
            [trip_id, liters, price_per_liter, total_cost]
        );
        return result.insertId;
    }
};

module.exports = FuelModel;
