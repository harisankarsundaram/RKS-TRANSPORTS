require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3106;
const TICK_MS = Number(process.env.MOCK_GPS_TICK_MS || 5000);

app.use(cors());
app.use(express.json());

let intervalHandle = null;

function randomBetween(min, max) {
    return (Math.random() * (max - min)) + min;
}

function parseRoutePolyline(rawPolyline) {
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

                if (point && point.latitude !== undefined && point.longitude !== undefined) {
                    return { latitude: Number(point.latitude), longitude: Number(point.longitude) };
                }

                return null;
            })
            .filter(Boolean);
    } catch (error) {
        return [];
    }
}

function squaredDistance(a, b) {
    const dLat = a.latitude - b.latitude;
    const dLng = a.longitude - b.longitude;
    return (dLat * dLat) + (dLng * dLng);
}

function nearestIndex(route, point) {
    let best = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    route.forEach((routePoint, index) => {
        const score = squaredDistance(routePoint, point);
        if (score < bestScore) {
            bestScore = score;
            best = index;
        }
    });

    return best;
}

function chooseSpeed() {
    const stopChance = Math.random();
    if (stopChance < 0.12) {
        return 0;
    }

    const overspeedChance = Math.random();
    if (overspeedChance < 0.06) {
        return randomBetween(82, 96);
    }

    return randomBetween(38, 72);
}

async function fetchRunningTrips(optionalTripId = null) {
    const where = ['status = \'Running\''];
    const params = [];

    if (optionalTripId) {
        params.push(Number(optionalTripId));
        where.push(`t.trip_id = $${params.length}`);
    }

    const result = await pool.query(
        `SELECT t.trip_id, t.truck_id, COALESCE(tr.route_polyline, t.route_polyline) AS route_polyline
         FROM trips t
         LEFT JOIN trip_routes tr ON tr.trip_id = t.trip_id
         WHERE ${where.join(' AND ')}`,
        params
    );

    return result.rows;
}

async function latestTripPoint(tripId) {
    const result = await pool.query(
        `SELECT latitude, longitude
         FROM gps_logs
         WHERE trip_id = $1
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [tripId]
    );

    return result.rows[0] || null;
}

async function insertGpsLog({ truckId, tripId, latitude, longitude, speed }) {
    await pool.query(
        `INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, speed_kmph, ignition, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [truckId, tripId, latitude, longitude, speed, speed > 0]
    );
}

async function finishTrip(tripId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const tripResult = await client.query(
            `UPDATE trips
             SET status = 'Completed', end_time = COALESCE(end_time, NOW())
             WHERE trip_id = $1
             RETURNING truck_id, driver_id`,
            [tripId]
        );

        if (tripResult.rows.length > 0) {
            const { truck_id, driver_id } = tripResult.rows[0];
            await client.query(`UPDATE trucks SET status = 'Available' WHERE truck_id = $1`, [truck_id]);
            await client.query(`UPDATE drivers SET status = 'Available', assigned_truck_id = NULL WHERE driver_id = $1`, [driver_id]);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function tickOneTrip(trip) {
    const route = parseRoutePolyline(trip.route_polyline);
    if (route.length === 0) {
        return {
            trip_id: trip.trip_id,
            status: 'skipped',
            reason: 'No route polyline available'
        };
    }

    const lastPoint = await latestTripPoint(trip.trip_id);

    let nextIndex = 0;
    if (lastPoint) {
        const currentIndex = nearestIndex(route, {
            latitude: Number(lastPoint.latitude),
            longitude: Number(lastPoint.longitude)
        });
        nextIndex = Math.min(currentIndex + 1, route.length - 1);
    }

    const speed = chooseSpeed();

    if (speed === 0 && lastPoint) {
        await insertGpsLog({
            truckId: trip.truck_id,
            tripId: trip.trip_id,
            latitude: Number(lastPoint.latitude),
            longitude: Number(lastPoint.longitude),
            speed
        });

        return {
            trip_id: trip.trip_id,
            truck_id: trip.truck_id,
            latitude: Number(lastPoint.latitude),
            longitude: Number(lastPoint.longitude),
            speed,
            event: 'idle-stop'
        };
    }

    const point = route[nextIndex];

    await insertGpsLog({
        truckId: trip.truck_id,
        tripId: trip.trip_id,
        latitude: point.latitude,
        longitude: point.longitude,
        speed
    });

    if (nextIndex >= route.length - 1) {
        await finishTrip(trip.trip_id);
        return {
            trip_id: trip.trip_id,
            truck_id: trip.truck_id,
            latitude: point.latitude,
            longitude: point.longitude,
            speed,
            event: 'arrived'
        };
    }

    return {
        trip_id: trip.trip_id,
        truck_id: trip.truck_id,
        latitude: point.latitude,
        longitude: point.longitude,
        speed,
        event: 'moving'
    };
}

async function tickTrips(optionalTripId = null) {
    const runningTrips = await fetchRunningTrips(optionalTripId);
    const results = [];

    for (const trip of runningTrips) {
        const result = await tickOneTrip(trip);
        results.push(result);
    }

    return results;
}

function startAutoTick() {
    if (intervalHandle) {
        return;
    }

    intervalHandle = setInterval(() => {
        tickTrips().catch((error) => {
            console.error('mock-gps tick failed:', error.message);
        });
    }, TICK_MS);

    if (typeof intervalHandle.unref === 'function') {
        intervalHandle.unref();
    }
}

function stopAutoTick() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            status: 'OK',
            service: 'mock-gps-service',
            tick_ms: TICK_MS,
            running: Boolean(intervalHandle),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.post('/mock-gps/tick', async (req, res) => {
    try {
        const { trip_id } = req.body || {};
        const updates = await tickTrips(trip_id || null);
        return res.json({ success: true, count: updates.length, data: updates });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/mock-gps/start', (req, res) => {
    startAutoTick();
    return res.json({ success: true, running: true, tick_ms: TICK_MS });
});

app.post('/mock-gps/stop', (req, res) => {
    stopAutoTick();
    return res.json({ success: true, running: false });
});

app.get('/mock-gps/state', async (req, res) => {
    try {
        const runningTrips = await fetchRunningTrips();
        return res.json({
            success: true,
            service: 'mock-gps-service',
            running: Boolean(intervalHandle),
            running_trip_count: runningTrips.length,
            tick_ms: TICK_MS
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`mock-gps-service running on port ${PORT}`);
    startAutoTick();
});
