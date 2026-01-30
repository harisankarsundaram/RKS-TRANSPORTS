const pool = require('../config/db');

const TripModel = {
    // Create Validated Trip
    async create(tripData) {
        const { truck_id, driver_id, lr_number, source, destination, freight_amount } = tripData;
        const [result] = await pool.execute(
            `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination, freight_amount, status, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, 'Planned', NOW())`,
            [truck_id, driver_id, lr_number, source, destination, freight_amount]
        );
        return { trip_id: result.insertId, ...tripData, status: 'Planned' };
    },

    // Check for existing active trip for truck
    async getActiveTripByTruck(truckId) {
        const [rows] = await pool.execute(
            `SELECT * FROM trips WHERE truck_id = ? AND status IN ('Planned', 'Running')`,
            [truckId]
        );
        return rows[0] || null;
    },

    // Check for duplicate LR number
    async findByLRNumber(lrNumber) {
        const [rows] = await pool.execute(
            `SELECT * FROM trips WHERE lr_number = ?`,
            [lrNumber]
        );
        return rows[0] || null;
    },

    // Start Trip
    async start(tripId) {
        const [result] = await pool.execute(
            `UPDATE trips SET status = 'Running', start_time = NOW() WHERE trip_id = ? AND status = 'Planned'`,
            [tripId]
        );
        return result.affectedRows > 0;
    },

    // End Trip
    async end(tripId) {
        const [result] = await pool.execute(
            `UPDATE trips SET status = 'Completed', end_time = NOW() WHERE trip_id = ? AND status = 'Running'`,
            [tripId]
        );
        return result.affectedRows > 0;
    },

    // Update Distance (from GPS)
    async updateDistance(tripId, addedDistance) {
        const [result] = await pool.execute(
            `UPDATE trips SET distance_km = distance_km + ? WHERE trip_id = ?`,
            [addedDistance, tripId]
        );
        return result.affectedRows > 0;
    },

    // Get Trip Details
    async getById(tripId) {
        const [rows] = await pool.execute(
            `SELECT t.*, tr.truck_number, d.name as driver_name, d.phone as driver_phone 
             FROM trips t
             JOIN trucks tr ON t.truck_id = tr.truck_id
             JOIN drivers d ON t.driver_id = d.driver_id
             WHERE t.trip_id = ?`,
            [tripId]
        );
        return rows[0] || null;
    },

    // Get All Trips
    async getAll() {
        const [rows] = await pool.execute(
            `SELECT t.*, tr.truck_number, d.name as driver_name 
             FROM trips t
             JOIN trucks tr ON t.truck_id = tr.truck_id
             JOIN drivers d ON t.driver_id = d.driver_id
             ORDER BY t.created_at DESC`
        );
        return rows;
    }
};

module.exports = TripModel;
