require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3108;
const OPERATIONAL_ALERT_TYPES = ['overspeed', 'idle_vehicle', 'no_progress_24h'];

app.use(cors());
app.use(express.json());

function toRadians(deg) {
    return (deg * Math.PI) / 180;
}

function distanceKm(a, b) {
    const dLat = toRadians(b.latitude - a.latitude);
    const dLon = toRadians(b.longitude - a.longitude);

    const p1 = toRadians(a.latitude);
    const p2 = toRadians(b.latitude);

    const n =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return 6371 * (2 * Math.atan2(Math.sqrt(n), Math.sqrt(1 - n)));
}

function sumDistance(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return 0;
    }

    let sum = 0;
    for (let i = 1; i < points.length; i += 1) {
        sum += distanceKm(points[i - 1], points[i]);
    }
    return sum;
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS alerts (
            id SERIAL PRIMARY KEY,
            truck_id INTEGER REFERENCES trucks(truck_id),
            trip_id INTEGER REFERENCES trips(trip_id) ON DELETE CASCADE,
            alert_type VARCHAR(50) NOT NULL,
            description TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

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

async function createAlertIfNotRecent({ truck_id, trip_id, alert_type, description, withinMinutes = 30 }) {
    const duplicate = await pool.query(
        `SELECT id
         FROM alerts
         WHERE truck_id = $1
           AND COALESCE(trip_id, -1) = COALESCE($2, -1)
           AND alert_type = $3
                     AND created_at >= NOW() - ($4::text || ' minutes')::interval
         LIMIT 1`,
                [truck_id, trip_id || null, alert_type, withinMinutes]
    );

    if (duplicate.rows.length > 0) {
        return null;
    }

    const inserted = await pool.query(
        `INSERT INTO alerts (truck_id, trip_id, alert_type, description, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING *`,
        [truck_id, trip_id || null, alert_type, description]
    );

    return inserted.rows[0];
}

async function evaluateTrip(trip) {
    const created = [];

    const latestResult = await pool.query(
        `SELECT latitude, longitude, COALESCE(speed_kmph, 0) AS speed, recorded_at
         FROM gps_logs
         WHERE trip_id = $1
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [trip.trip_id]
    );

    if (latestResult.rows.length === 0) {
        return created;
    }

    const latest = latestResult.rows[0];
    const currentSpeed = Number(latest.speed || 0);

    if (currentSpeed > 80) {
        const alert = await createAlertIfNotRecent({
            truck_id: trip.truck_id,
            trip_id: trip.trip_id,
            alert_type: 'overspeed',
            description: `Overspeed detected at ${currentSpeed.toFixed(1)} km/h`
        });
        if (alert) {
            created.push(alert);
        }
    }

    const idleWindow = await pool.query(
        `SELECT COALESCE(speed_kmph, 0) AS speed, recorded_at
         FROM gps_logs
         WHERE trip_id = $1
           AND recorded_at >= NOW() - INTERVAL '30 minutes'
         ORDER BY recorded_at ASC`,
        [trip.trip_id]
    );

    if (idleWindow.rows.length > 1) {
        const allZero = idleWindow.rows.every((row) => Number(row.speed) === 0);
        const start = new Date(idleWindow.rows[0].recorded_at);
        const end = new Date(idleWindow.rows[idleWindow.rows.length - 1].recorded_at);
        const idleMinutes = (end - start) / (1000 * 60);

        if (allZero && idleMinutes >= 30) {
            const alert = await createAlertIfNotRecent({
                truck_id: trip.truck_id,
                trip_id: trip.trip_id,
                alert_type: 'idle_vehicle',
                description: `Vehicle idle for ${idleMinutes.toFixed(1)} minutes`
            });
            if (alert) {
                created.push(alert);
            }
        }
    }

    const startedAtMs = trip.started_at ? new Date(trip.started_at).getTime() : NaN;
    const tripAgeMs = Number.isFinite(startedAtMs) ? (Date.now() - startedAtMs) : (24 * 60 * 60 * 1000);

    if (tripAgeMs >= (24 * 60 * 60 * 1000)) {
        const progressWindow = await pool.query(
            `SELECT latitude, longitude, recorded_at
             FROM gps_logs
             WHERE trip_id = $1
               AND recorded_at >= NOW() - INTERVAL '24 hours'
             ORDER BY recorded_at ASC`,
            [trip.trip_id]
        );

        const path = progressWindow.rows.map((row) => ({
            latitude: Number(row.latitude),
            longitude: Number(row.longitude)
        }));

        let noProgress24h = false;
        let progressKm24h = 0;

        if (path.length < 2) {
            noProgress24h = true;
        } else {
            progressKm24h = sumDistance(path);
            noProgress24h = progressKm24h < 0.5;
        }

        if (noProgress24h) {
            const alert = await createAlertIfNotRecent({
                truck_id: trip.truck_id,
                trip_id: trip.trip_id,
                alert_type: 'no_progress_24h',
                description: progressKm24h > 0
                    ? `No meaningful progress in last 24 hours (${progressKm24h.toFixed(2)} km)`
                    : 'No trip progress recorded in last 24 hours',
                withinMinutes: 1440
            });
            if (alert) {
                created.push(alert);
            }
        }
    }

    return created;
}

async function evaluateAlerts() {
    const runningTrips = await pool.query(
    `SELECT t.trip_id, t.truck_id,
        COALESCE(t.start_time, t.created_at) AS started_at
         FROM trips t
         WHERE LOWER(t.status) IN ('running', 'in_progress')`
    );

    const alerts = [];
    for (const trip of runningTrips.rows) {
        try {
            const createdForTrip = await evaluateTrip(trip);
            alerts.push(...createdForTrip);
        } catch (error) {
            console.error(`Alert evaluation failed for trip ${trip.trip_id}:`, error.message);
        }
    }

    return alerts;
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', service: 'alert-service', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.get('/alerts', async (req, res) => {
    const { limit = 100 } = req.query;
    const includeAll = String(req.query.include_all || '').toLowerCase() === 'true';

    try {
        if (includeAll) {
            const result = await pool.query(
                `SELECT * FROM alerts ORDER BY created_at DESC LIMIT $1`,
                [Number(limit)]
            );

            return res.json({ success: true, count: result.rows.length, data: result.rows });
        }

        const result = await pool.query(
            `SELECT *
             FROM alerts
             WHERE alert_type = ANY($1::text[])
             ORDER BY created_at DESC
             LIMIT $2`,
            [OPERATIONAL_ALERT_TYPES, Number(limit)]
        );

        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/alerts/evaluate', async (req, res) => {
    try {
        const created = await evaluateAlerts();
        return res.json({ success: true, alerts_created: created.length, data: created });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`alert-service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('alert-service startup failed:', error);
        process.exit(1);
    });
