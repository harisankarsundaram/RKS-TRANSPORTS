require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3206);
const TICK_MS = Number(process.env.MOCK_GPS_TICK_MS || 5000);

app.use(cors());
app.use(express.json());

let intervalHandle = null;

function randomBetween(min, max) {
    return (Math.random() * (max - min)) + min;
}

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

function hashText(value) {
    const text = String(value || 'unknown');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function coordinateFromText(value) {
    const h1 = hashText(value);
    const h2 = hashText(`${value}-lng`);

    return {
        latitude: 8 + ((h1 % 2800) / 100),
        longitude: 68 + ((h2 % 2900) / 100)
    };
}

function nextPointTowards(current, destination) {
    const ratio = 0.08;
    const jitterLat = randomBetween(-0.0025, 0.0025);
    const jitterLon = randomBetween(-0.0025, 0.0025);

    return {
        latitude: current.latitude + ((destination.latitude - current.latitude) * ratio) + jitterLat,
        longitude: current.longitude + ((destination.longitude - current.longitude) * ratio) + jitterLon
    };
}

function chooseSpeed(distanceToDestinationKm) {
    if (distanceToDestinationKm < 1) {
        return randomBetween(0, 18);
    }

    const stopChance = Math.random();
    if (stopChance < 0.1) {
        return 0;
    }

    const overspeedChance = Math.random();
    if (overspeedChance < 0.08) {
        return randomBetween(82, 95);
    }

    return randomBetween(32, 72);
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

    await pool.query('CREATE INDEX IF NOT EXISTS idx_mock_gps_trip_time_phase2 ON gps_logs(trip_id, timestamp DESC)');
}

async function fetchActiveTrips(optionalTripId = null) {
    const params = [];
    const where = ["LOWER(status) IN ('in_progress', 'running')"];

    if (optionalTripId) {
        params.push(Number(optionalTripId));
        where.push(`trip_id = $${params.length}`);
    }

    const result = await pool.query(
        `SELECT trip_id, truck_id, source, destination, status
         FROM trips
         WHERE ${where.join(' AND ')}
         ORDER BY trip_id ASC`,
        params
    );

    return result.rows;
}

async function latestPoint(tripId) {
    const result = await pool.query(
        `SELECT latitude, longitude, speed, timestamp
         FROM gps_logs
         WHERE trip_id = $1
         ORDER BY timestamp DESC
         LIMIT 1`,
        [tripId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return {
        latitude: Number(result.rows[0].latitude),
        longitude: Number(result.rows[0].longitude),
        speed: Number(result.rows[0].speed),
        timestamp: result.rows[0].timestamp
    };
}

async function insertLog({ truck_id, trip_id, latitude, longitude, speed }) {
    const inserted = await pool.query(
        `INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, speed, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING truck_id, trip_id, latitude, longitude, speed, timestamp`,
        [truck_id, trip_id, latitude, longitude, speed]
    );

    return inserted.rows[0];
}

async function tickTrip(trip) {
    const destination = coordinateFromText(trip.destination);
    const source = coordinateFromText(trip.source);
    const current = await latestPoint(trip.trip_id);

    const startPoint = current || source;
    const remaining = distanceKm(startPoint, destination);
    const nextPoint = nextPointTowards(startPoint, destination);
    const speed = chooseSpeed(remaining);

    const inserted = await insertLog({
        truck_id: Number(trip.truck_id),
        trip_id: Number(trip.trip_id),
        latitude: nextPoint.latitude,
        longitude: nextPoint.longitude,
        speed
    });

    return {
        truck_id: Number(inserted.truck_id),
        trip_id: Number(inserted.trip_id),
        latitude: Number(inserted.latitude),
        longitude: Number(inserted.longitude),
        speed: Number(inserted.speed),
        timestamp: inserted.timestamp
    };
}

async function tickTrips(optionalTripId = null) {
    const activeTrips = await fetchActiveTrips(optionalTripId);
    const updates = [];

    for (const trip of activeTrips) {
        const update = await tickTrip(trip);
        updates.push(update);
    }

    return updates;
}

function startAutoTick() {
    if (intervalHandle) {
        return;
    }

    intervalHandle = setInterval(() => {
        tickTrips().catch((error) => {
            console.error('mock-gps auto tick failed:', error.message);
        });
    }, TICK_MS);

    if (typeof intervalHandle.unref === 'function') {
        intervalHandle.unref();
    }
}

function stopAutoTick() {
    if (!intervalHandle) {
        return;
    }

    clearInterval(intervalHandle);
    intervalHandle = null;
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({
            status: 'OK',
            service: 'mock-gps-service',
            tick_ms: TICK_MS,
            running: Boolean(intervalHandle),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.post('/mock-gps/tick', async (req, res) => {
    const { trip_id = null } = req.body || {};

    try {
        const updates = await tickTrips(trip_id);
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
    return res.json({ success: true, running: false, tick_ms: TICK_MS });
});

app.get('/mock-gps/state', async (req, res) => {
    try {
        const activeTrips = await fetchActiveTrips();
        return res.json({
            success: true,
            running: Boolean(intervalHandle),
            tick_ms: TICK_MS,
            active_trip_count: activeTrips.length
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`mock-gps-service running on port ${PORT}`);
            startAutoTick();
        });
    })
    .catch((error) => {
        console.error('mock-gps-service startup failed:', error);
        process.exit(1);
    });
