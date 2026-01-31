const pool = require('../config/db');

const GpsModel = {
    // Log new GPS point
    async logLocation(gpsData) {
        const { truck_id, trip_id, latitude, longitude } = gpsData;
        const result = await pool.query(
            `INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, recorded_at) 
             VALUES ($1, $2, $3, $4, NOW()) RETURNING gps_id`,
            [truck_id, trip_id, latitude, longitude]
        );
        return result.rows[0].gps_id;
    },

    // Get last logged location for a trip to calculate distance
    async getLastLocation(trip_id) {
        const result = await pool.query(
            `SELECT latitude, longitude FROM gps_logs 
             WHERE trip_id = $1 
             ORDER BY recorded_at DESC LIMIT 1`,
            [trip_id]
        );
        return result.rows[0] || null;
    }
};

module.exports = GpsModel;
