require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3105;

app.use(cors());
app.use(express.json());

function toRadians(deg) {
    return (deg * Math.PI) / 180;
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

function sumSegmentDistance(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return 0;
    }

    let sum = 0;
    for (let i = 1; i < points.length; i += 1) {
        sum += distanceKm(points[i - 1], points[i]);
    }
    return sum;
}

function normalizePolyline(rawPolyline) {
    if (!rawPolyline) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawPolyline);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((point) => {
                if (Array.isArray(point) && point.length >= 2) {
                    return { longitude: Number(point[0]), latitude: Number(point[1]) };
                }
                if (point && point.longitude !== undefined && point.latitude !== undefined) {
                    return { longitude: Number(point.longitude), latitude: Number(point.latitude) };
                }
                return null;
            })
            .filter(Boolean);
    } catch (error) {
        return [];
    }
}

async function getTripPath(tripId) {
    const logsResult = await pool.query(
        `SELECT latitude, longitude, COALESCE(speed_kmph, 0) AS speed, recorded_at
         FROM gps_logs
         WHERE trip_id = $1
         ORDER BY recorded_at ASC`,
        [tripId]
    );

    return logsResult.rows.map((row) => ({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speed: Number(row.speed),
        timestamp: row.recorded_at
    }));
}

async function ensureSchema() {
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_polyline TEXT');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS trip_routes (
            trip_id INTEGER PRIMARY KEY REFERENCES trips(trip_id) ON DELETE CASCADE,
            route_polyline TEXT NOT NULL,
            distance NUMERIC(10,2) NOT NULL,
            estimated_time NUMERIC(10,2) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', service: 'tracking-service', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.get('/tracking/live', async (req, res) => {
    try {
        const latest = await pool.query(`
            SELECT
                t.trip_id,
                t.truck_id,
                t.source,
                t.destination,
                t.status AS trip_status,
                tr.truck_number,
                COALESCE(last_trip.latitude, last_truck.latitude) AS latitude,
                COALESCE(last_trip.longitude, last_truck.longitude) AS longitude,
                COALESCE(last_trip.speed_kmph, last_truck.speed_kmph, 0) AS speed,
                COALESCE(last_trip.recorded_at, last_truck.recorded_at, NOW()) AS timestamp,
                COALESCE(t.distance_km, 0) AS trip_distance
            FROM trips t
            LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
            LEFT JOIN LATERAL (
                SELECT latitude, longitude, speed_kmph, recorded_at
                FROM gps_logs
                WHERE trip_id = t.trip_id
                ORDER BY recorded_at DESC
                LIMIT 1
            ) last_trip ON TRUE
            LEFT JOIN LATERAL (
                SELECT latitude, longitude, speed_kmph, recorded_at
                FROM gps_logs
                WHERE truck_id = t.truck_id
                ORDER BY recorded_at DESC
                LIMIT 1
            ) last_truck ON TRUE
            WHERE LOWER(t.status) IN ('running', 'in_progress')
            ORDER BY t.trip_id ASC
        `);

        const data = [];

        for (const item of latest.rows) {
            const latitude = Number(item.latitude);
            const longitude = Number(item.longitude);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                continue;
            }

            const tripPath = await getTripPath(item.trip_id);
            const distanceTravelled = sumSegmentDistance(tripPath);
            const totalDistance = Math.max(Number(item.trip_distance || 0), distanceTravelled);
            const tripProgress = totalDistance > 0
                ? Math.min(distanceTravelled / totalDistance, 1)
                : 0;

            data.push({
                truck_id: Number(item.truck_id),
                truck_number: item.truck_number || String(item.truck_id),
                trip_id: Number(item.trip_id),
                latitude,
                longitude,
                speed: Number(item.speed || 0),
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
        const [tripResult, logResult] = await Promise.all([
            pool.query(
                `SELECT t.*, tr.route_polyline AS route_polyline_table, tr.distance AS route_distance
                 FROM trips t
                 LEFT JOIN trip_routes tr ON tr.trip_id = t.trip_id
                 WHERE t.trip_id = $1`,
                [tripId]
            ),
            pool.query(
                `SELECT latitude, longitude, COALESCE(speed_kmph, 0) AS speed, recorded_at
                 FROM gps_logs
                 WHERE trip_id = $1
                 ORDER BY recorded_at ASC`,
                [tripId]
            )
        ]);

        if (tripResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        const trip = tripResult.rows[0];
        const logs = logResult.rows.map((row) => ({
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            speed: Number(row.speed),
            timestamp: row.recorded_at
        }));

        const routePolyline = normalizePolyline(trip.route_polyline_table || trip.route_polyline);
        const routeDistance = routePolyline.length > 1
            ? sumSegmentDistance(routePolyline)
            : Number(trip.route_distance || trip.distance_km || 0);

        const travelledDistance = sumSegmentDistance(logs);
        const progress = routeDistance > 0
            ? Math.min(1, travelledDistance / routeDistance)
            : 0;

        return res.json({
            success: true,
            data: {
                trip_id: trip.trip_id,
                truck_id: trip.truck_id,
                source: trip.source,
                destination: trip.destination,
                status: trip.status,
                route: routePolyline,
                gps_logs: logs,
                distance_travelled_km: Number(travelledDistance.toFixed(3)),
                total_route_distance_km: Number(routeDistance.toFixed(3)),
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
