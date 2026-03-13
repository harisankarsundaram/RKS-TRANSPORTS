const pool = require('../config/db');

const GpsModel = {
    // Log new GPS point
    async logLocation(gpsData) {
        const {
            truck_id,
            trip_id,
            latitude,
            longitude,
            speed_kmph = 0,
            ignition = true,
            recorded_at = new Date().toISOString()
        } = gpsData;
        const result = await pool.query(
            `INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, speed_kmph, ignition, recorded_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING gps_id`,
            [truck_id, trip_id, latitude, longitude, speed_kmph, ignition, recorded_at]
        );
        return result.rows[0].gps_id;
    },

    // Get last logged location for a trip to calculate distance
    async getLastLocation(trip_id) {
        const result = await pool.query(
            `SELECT latitude, longitude, speed_kmph, ignition, recorded_at FROM gps_logs 
             WHERE trip_id = $1 
             ORDER BY recorded_at DESC LIMIT 1`,
            [trip_id]
        );
        return result.rows[0] || null;
    },

    async getRoutePoints(trip_id) {
        const result = await pool.query(
            `SELECT latitude, longitude, speed_kmph, ignition, recorded_at
             FROM gps_logs
             WHERE trip_id = $1
             ORDER BY recorded_at ASC`,
            [trip_id]
        );
        return result.rows;
    }
};

module.exports = GpsModel;
