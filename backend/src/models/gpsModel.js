const pool = require('../config/db');

const GpsModel = {
    // Log new GPS point
    async logLocation(gpsData) {
        const { truck_id, trip_id, latitude, longitude } = gpsData;
        const [result] = await pool.execute(
            `INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, recorded_at) 
             VALUES (?, ?, ?, ?, NOW())`,
            [truck_id, trip_id, latitude, longitude]
        );
        return result.insertId;
    },

    // Get last logged location for a trip to calculate distance
    async getLastLocation(trip_id) {
        const [rows] = await pool.execute(
            `SELECT latitude, longitude FROM gps_logs 
             WHERE trip_id = ? 
             ORDER BY recorded_at DESC LIMIT 1`,
            [trip_id]
        );
        return rows[0] || null;
    }
};

module.exports = GpsModel;
