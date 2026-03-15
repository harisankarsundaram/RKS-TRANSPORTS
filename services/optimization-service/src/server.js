require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3209);
const WORKER_INTERVAL_MS = Number(process.env.OPTIMIZATION_INTERVAL_MS || 120000);

app.use(cors());
app.use(express.json());

let workerHandle = null;

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

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS optimization_suggestions (
            suggestion_id SERIAL PRIMARY KEY,
            truck_id INTEGER NOT NULL,
            booking_id INTEGER NOT NULL,
            distance_to_pickup_km NUMERIC(10,2) NOT NULL,
            score NUMERIC(10,4) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'open',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_optimization_unique_open_phase2 ON optimization_suggestions(truck_id, booking_id, status)');

    await pool.query('ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS pickup_latitude NUMERIC(10,7)');
    await pool.query('ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS pickup_longitude NUMERIC(10,7)');
}

async function upsertSuggestion(item) {
    const result = await pool.query(
        `INSERT INTO optimization_suggestions (
            truck_id,
            booking_id,
            distance_to_pickup_km,
            score,
            status,
            created_at,
            updated_at
         ) VALUES (
            $1,$2,$3,$4,'open',NOW(),NOW()
         )
         ON CONFLICT (truck_id, booking_id, status)
         DO UPDATE SET
            distance_to_pickup_km = EXCLUDED.distance_to_pickup_km,
            score = EXCLUDED.score,
            updated_at = NOW()
         RETURNING *`,
        [
            Number(item.truck_id),
            Number(item.booking_id),
            Number(item.distance_to_pickup_km.toFixed(2)),
            Number(item.score.toFixed(4))
        ]
    );

    return result.rows[0];
}

async function evaluateBackhaulOpportunities() {
    const truckLocations = await pool.query(
        `SELECT DISTINCT ON (g.truck_id)
            g.truck_id,
            g.latitude,
            g.longitude,
            t.capacity_tons
         FROM gps_logs g
         JOIN trucks t ON t.truck_id = g.truck_id
         ORDER BY g.truck_id, g.timestamp DESC`
    );

    const pendingBookings = await pool.query(
        `SELECT id, pickup_location, pickup_latitude, pickup_longitude, weight
         FROM booking_requests
         WHERE LOWER(status) = 'pending'
         ORDER BY created_at ASC`
    );

    const suggestions = [];

    for (const truck of truckLocations.rows) {
        const truckPosition = {
            latitude: Number(truck.latitude),
            longitude: Number(truck.longitude)
        };
        const truckCapacity = Number(truck.capacity_tons || 0);

        for (const booking of pendingBookings.rows) {
            const pickupPoint = booking.pickup_latitude !== null && booking.pickup_longitude !== null
                ? {
                    latitude: Number(booking.pickup_latitude),
                    longitude: Number(booking.pickup_longitude)
                }
                : coordinateFromText(booking.pickup_location);

            const bookingWeight = Number(booking.weight || 0);
            const km = distanceKm(truckPosition, pickupPoint);

            if (km < 50 && truckCapacity >= bookingWeight) {
                const score = (50 - km) + (truckCapacity - bookingWeight);

                const saved = await upsertSuggestion({
                    truck_id: Number(truck.truck_id),
                    booking_id: Number(booking.id),
                    distance_to_pickup_km: km,
                    score
                });

                suggestions.push(saved);
            }
        }
    }

    return suggestions;
}

function startWorker() {
    if (workerHandle) {
        return;
    }

    workerHandle = setInterval(() => {
        evaluateBackhaulOpportunities().catch((error) => {
            console.error('optimization worker cycle failed:', error.message);
        });
    }, WORKER_INTERVAL_MS);

    if (typeof workerHandle.unref === 'function') {
        workerHandle.unref();
    }
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({
            status: 'OK',
            service: 'optimization-service',
            worker_running: Boolean(workerHandle),
            worker_interval_ms: WORKER_INTERVAL_MS,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.post('/optimization/run', async (req, res) => {
    try {
        const suggestions = await evaluateBackhaulOpportunities();
        return res.json({ success: true, count: suggestions.length, data: suggestions });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/optimization/suggestions', async (req, res) => {
    const limit = Number(req.query.limit || 100);

    try {
        const result = await pool.query(
            `SELECT *
             FROM optimization_suggestions
             WHERE status = 'open'
             ORDER BY score DESC, distance_to_pickup_km ASC, updated_at DESC
             LIMIT $1`,
            [limit]
        );

        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(async () => {
        await evaluateBackhaulOpportunities().catch(() => null);
        app.listen(PORT, () => {
            console.log(`optimization-service running on port ${PORT}`);
            startWorker();
        });
    })
    .catch((error) => {
        console.error('optimization-service startup failed:', error);
        process.exit(1);
    });
