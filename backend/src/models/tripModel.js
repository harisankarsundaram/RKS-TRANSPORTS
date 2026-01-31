const pool = require('../config/db');

const TripModel = {
    // Create Validated Trip
    async create(tripData) {
        const { truck_id, driver_id, lr_number, source, destination, freight_amount } = tripData;
        const result = await pool.query(
            `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination, freight_amount, status, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, 'Planned', NOW()) RETURNING trip_id`,
            [truck_id, driver_id, lr_number, source, destination, freight_amount]
        );
        return { trip_id: result.rows[0].trip_id, ...tripData, status: 'Planned' };
    },

    // Check for existing active trip for truck
    async getActiveTripByTruck(truckId) {
        const result = await pool.query(
            `SELECT * FROM trips WHERE truck_id = $1 AND status IN ('Planned', 'Running')`,
            [truckId]
        );
        return result.rows[0] || null;
    },

    // Check for duplicate LR number
    async findByLRNumber(lrNumber) {
        const result = await pool.query(
            `SELECT * FROM trips WHERE lr_number = $1`,
            [lrNumber]
        );
        return result.rows[0] || null;
    },

    // Start Trip
    async start(tripId) {
        const result = await pool.query(
            `UPDATE trips SET status = 'Running', start_time = NOW() WHERE trip_id = $1 AND status = 'Planned'`,
            [tripId]
        );
        return result.rowCount > 0;
    },

    // End Trip
    async end(tripId) {
        const result = await pool.query(
            `UPDATE trips SET status = 'Completed', end_time = NOW() WHERE trip_id = $1 AND status = 'Running'`,
            [tripId]
        );
        return result.rowCount > 0;
    },

    // Update Distance (from GPS)
    async updateDistance(tripId, addedDistance) {
        const result = await pool.query(
            `UPDATE trips SET distance_km = distance_km + $1 WHERE trip_id = $2`,
            [addedDistance, tripId]
        );
        return result.rowCount > 0;
    },

    // Get Trip Details
    async getById(tripId) {
        const result = await pool.query(
            `SELECT t.*, tr.truck_number, d.name as driver_name, d.phone as driver_phone 
             FROM trips t
             JOIN trucks tr ON t.truck_id = tr.truck_id
             JOIN drivers d ON t.driver_id = d.driver_id
             WHERE t.trip_id = $1`,
            [tripId]
        );
        return result.rows[0] || null;
    },

    // Get All Trips
    async getAll() {
        const result = await pool.query(
            `SELECT t.*, tr.truck_number, d.name as driver_name 
             FROM trips t
             JOIN trucks tr ON t.truck_id = tr.truck_id
             JOIN drivers d ON t.driver_id = d.driver_id
             ORDER BY t.created_at DESC`
        );
        return result.rows;
    }
};

module.exports = TripModel;
