require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { resolveRoutePoints, routeDistanceKm, routeToPolyline } = require('./providers/mockRouteProvider');

const app = express();
const PORT = process.env.PORT || 3106;
const TICK_MS = Number(process.env.MOCK_GPS_TICK_MS || 5000);
const MIN_ROUTE_POINTS = Number(process.env.MOCK_GPS_MIN_ROUTE_POINTS || 80);

app.use(cors());
app.use(express.json());

let intervalHandle = null;

function randomBetween(min, max) {
    return (Math.random() * (max - min)) + min;
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

function interpolatePoint(start, end, ratio) {
    return {
        latitude: Number((start.latitude + ((end.latitude - start.latitude) * ratio)).toFixed(6)),
        longitude: Number((start.longitude + ((end.longitude - start.longitude) * ratio)).toFixed(6))
    };
}

function densifyRoute(route, minPoints = MIN_ROUTE_POINTS) {
    if (!Array.isArray(route) || route.length < 2) {
        return Array.isArray(route) ? route : [];
    }

    if (!Number.isFinite(minPoints) || minPoints <= route.length) {
        return route;
    }

    const segments = route.length - 1;
    const interiorPoints = Math.max(minPoints - 1, segments);
    const baseSubdivisions = Math.floor(interiorPoints / segments);
    const remainder = interiorPoints % segments;
    const densified = [route[0]];

    for (let index = 0; index < segments; index += 1) {
        const start = route[index];
        const end = route[index + 1];
        const subdivisions = Math.max(1, baseSubdivisions + (index < remainder ? 1 : 0));

        for (let step = 1; step <= subdivisions; step += 1) {
            const ratio = step / subdivisions;
            densified.push(interpolatePoint(start, end, ratio));
        }
    }

    return densified;
}

async function fetchRunningTrips(optionalTripId = null) {
    const where = ['status = \'Running\''];
    const params = [];

    if (optionalTripId) {
        params.push(Number(optionalTripId));
        where.push(`t.trip_id = $${params.length}`);
    }

    const result = await pool.query(
        `SELECT
            t.trip_id,
            t.truck_id,
            t.source,
            t.destination,
            t.distance_km,
            COALESCE(tr.route_polyline, t.route_polyline) AS route_polyline
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

async function persistRouteIfMissing(trip, route) {
    if (trip.route_polyline) {
        return;
    }

    const polyline = routeToPolyline(route);
    const distance = Number(routeDistanceKm(route).toFixed(2));
    const estimatedMinutes = Number(((distance / 42) * 60).toFixed(2));

    await pool.query('UPDATE trips SET route_polyline = $1 WHERE trip_id = $2', [polyline, trip.trip_id]);
    await pool.query(
        `INSERT INTO trip_routes (trip_id, route_polyline, distance, estimated_time)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (trip_id)
         DO UPDATE SET route_polyline = EXCLUDED.route_polyline, distance = EXCLUDED.distance, estimated_time = EXCLUDED.estimated_time`,
        [trip.trip_id, polyline, distance, estimatedMinutes]
    );
}

async function tickOneTrip(trip) {
    const { route } = await resolveRoutePoints({
        rawPolyline: trip.route_polyline,
        source: trip.source,
        destination: trip.destination,
        distanceHintKm: Number(trip.distance_km || 0)
    });

    if (route.length === 0) {
        return {
            trip_id: trip.trip_id,
            status: 'skipped',
            reason: 'No route polyline available'
        };
    }

    await persistRouteIfMissing(trip, route);

    const simulationRoute = densifyRoute(route);

    const lastPoint = await latestTripPoint(trip.trip_id);

    let nextIndex = 0;
    if (lastPoint) {
        const currentIndex = nearestIndex(simulationRoute, {
            latitude: Number(lastPoint.latitude),
            longitude: Number(lastPoint.longitude)
        });
        nextIndex = Math.min(currentIndex + 1, simulationRoute.length - 1);
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

    const point = simulationRoute[nextIndex];

    await insertGpsLog({
        truckId: trip.truck_id,
        tripId: trip.trip_id,
        latitude: point.latitude,
        longitude: point.longitude,
        speed
    });

    if (nextIndex >= simulationRoute.length - 1) {
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
            min_route_points: MIN_ROUTE_POINTS,
            route_provider: String(process.env.GPS_ROUTE_PROVIDER || 'mock').toLowerCase(),
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
            route_provider: String(process.env.GPS_ROUTE_PROVIDER || 'mock').toLowerCase(),
            running: Boolean(intervalHandle),
            running_trip_count: runningTrips.length,
            tick_ms: TICK_MS,
            min_route_points: MIN_ROUTE_POINTS
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`mock-gps-service running on port ${PORT}`);
    startAutoTick();
});
