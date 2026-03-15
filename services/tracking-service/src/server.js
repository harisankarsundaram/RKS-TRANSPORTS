require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3205);

app.use(cors());
app.use(express.json());

function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

function distanceKm(start, end) {
    const dLat = toRadians(end.latitude - start.latitude);
    const dLon = toRadians(end.longitude - start.longitude);
    const lat1 = toRadians(start.latitude);
    const lat2 = toRadians(end.latitude);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

    return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function sumDistance(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return 0;
    }

    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += distanceKm(points[index - 1], points[index]);
    }

    return total;
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS gps_logs (
            gps_id SERIAL PRIMARY KEY,
            truck_id INTEGER NOT NULL,
            trip_id INTEGER NOT NULL,
            latitude NUMERIC(10,7) NOT NULL,
            longitude NUMERIC(10,7) NOT NULL,
            speed NUMERIC(10,2) NOT NULL,
            timestamp TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_gps_logs_trip_time_phase2 ON gps_logs(trip_id, timestamp DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_gps_logs_truck_time_phase2 ON gps_logs(truck_id, timestamp DESC)');
}

async function getTripPath(tripId) {
    const logsResult = await pool.query(
        `SELECT latitude, longitude, speed, timestamp
         FROM gps_logs
         WHERE trip_id = $1
         ORDER BY timestamp ASC`,
        [tripId]
    );

    return logsResult.rows.map((row) => ({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speed: Number(row.speed),
        timestamp: row.timestamp
    }));
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({
            status: 'OK',
            service: 'tracking-service',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.get('/tracking/live', async (req, res) => {
    try {
        const latestResult = await pool.query(
            `SELECT DISTINCT ON (g.truck_id)
                g.truck_id,
                g.trip_id,
                g.latitude,
                g.longitude,
                g.speed,
                g.timestamp,
                t.trip_distance
             FROM gps_logs g
             JOIN trips t ON t.trip_id = g.trip_id
             WHERE LOWER(t.status) IN ('in_progress', 'running')
             ORDER BY g.truck_id, g.timestamp DESC`
        );

        const data = [];

        for (const item of latestResult.rows) {
            const tripPath = await getTripPath(item.trip_id);
            const distanceTravelled = sumDistance(tripPath);
            const totalDistance = Number(item.trip_distance || 0);
            const tripProgress = totalDistance > 0
                ? Math.min(distanceTravelled / totalDistance, 1)
                : 0;

            data.push({
                truck_id: Number(item.truck_id),
                trip_id: Number(item.trip_id),
                latitude: Number(item.latitude),
                longitude: Number(item.longitude),
                speed: Number(item.speed),
                timestamp: item.timestamp,
                trip_progress: Number(tripProgress.toFixed(4)),
                distance_travelled: Number(distanceTravelled.toFixed(3)),
                trip_distance: Number(totalDistance.toFixed(3))
            });
        }

        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/tracking/trip/:tripId', async (req, res) => {
    const tripId = Number(req.params.tripId);
    if (!Number.isFinite(tripId)) {
        return res.status(400).json({ success: false, message: 'Invalid trip id' });
    }

    try {
        const tripResult = await pool.query(
            `SELECT trip_id, truck_id, source, destination, status, trip_distance
             FROM trips
             WHERE trip_id = $1`,
            [tripId]
        );

        if (tripResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        const trip = tripResult.rows[0];
        const path = await getTripPath(tripId);
        const travelled = sumDistance(path);
        const totalDistance = Number(trip.trip_distance || 0);
        const progress = totalDistance > 0 ? Math.min(travelled / totalDistance, 1) : 0;

        return res.json({
            success: true,
            data: {
                trip_id: Number(trip.trip_id),
                truck_id: Number(trip.truck_id),
                source: trip.source,
                destination: trip.destination,
                status: trip.status,
                gps_logs: path,
                route: path.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
                distance_travelled_km: Number(travelled.toFixed(3)),
                total_route_distance_km: Number(totalDistance.toFixed(3)),
                progress: Number(progress.toFixed(4)),
                progress_percent: Number((progress * 100).toFixed(2))
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`tracking-service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('tracking-service startup failed:', error);
        process.exit(1);
    });
