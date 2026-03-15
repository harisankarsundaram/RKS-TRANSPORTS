require('dotenv').config();

const axios = require('axios');
const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3207);
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const WORKER_INTERVAL_MS = Number(process.env.ANALYTICS_INTERVAL_MS || 120000);

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

function deriveTrafficLevel(currentSpeed) {
    if (currentSpeed <= 20) {
        return 0.9;
    }
    if (currentSpeed <= 40) {
        return 0.6;
    }
    return 0.35;
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS trip_predictions (
            prediction_id SERIAL PRIMARY KEY,
            trip_id INTEGER NOT NULL,
            truck_id INTEGER NOT NULL,
            distance_remaining NUMERIC(10,3) NOT NULL,
            current_speed NUMERIC(10,2) NOT NULL,
            historical_speed NUMERIC(10,2) NOT NULL,
            trip_distance NUMERIC(10,2) NOT NULL,
            eta_minutes NUMERIC(10,2) NOT NULL,
            delay_probability NUMERIC(5,4) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_trip_predictions_trip_time_phase2 ON trip_predictions(trip_id, created_at DESC)');
}

async function fetchTripGpsLogs(tripId) {
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

async function analyzeTrip(trip) {
    const logs = await fetchTripGpsLogs(trip.trip_id);

    if (logs.length === 0) {
        return null;
    }

    const travelledDistance = sumDistance(logs);
    const tripDistance = Number(trip.trip_distance || 0);
    const distanceRemaining = Math.max(tripDistance - travelledDistance, 0);

    const lastLog = logs[logs.length - 1];
    const currentSpeed = Number(lastLog.speed || 0);

    const historicalSpeeds = logs
        .map((item) => Number(item.speed || 0))
        .filter((value) => value > 0);

    const historicalSpeed = historicalSpeeds.length
        ? historicalSpeeds.reduce((sum, value) => sum + value, 0) / historicalSpeeds.length
        : Math.max(currentSpeed, 35);

    const etaResponse = await axios.post(
        `${ML_SERVICE_URL}/predict/eta`,
        {
            distance_remaining: Number(distanceRemaining.toFixed(3)),
            current_speed: Number(currentSpeed.toFixed(2)),
            historical_speed: Number(historicalSpeed.toFixed(2)),
            trip_distance: Number(tripDistance.toFixed(3))
        },
        { timeout: 12000 }
    );

    const etaMinutes = Number(etaResponse.data?.eta_minutes || 0);

    const plannedArrival = trip.planned_end_time
        ? new Date(trip.planned_end_time).toISOString()
        : new Date(Date.now() + (Math.max(etaMinutes, 60) * 60000)).toISOString();

    const delayResponse = await axios.post(
        `${ML_SERVICE_URL}/predict/delay`,
        {
            planned_arrival_time: plannedArrival,
            predicted_eta: Number(etaMinutes.toFixed(2)),
            traffic_level: deriveTrafficLevel(currentSpeed)
        },
        { timeout: 12000 }
    );

    const delayProbability = Number(delayResponse.data?.delay_probability || 0);

    const inserted = await pool.query(
        `INSERT INTO trip_predictions (
            trip_id,
            truck_id,
            distance_remaining,
            current_speed,
            historical_speed,
            trip_distance,
            eta_minutes,
            delay_probability,
            created_at
         ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,NOW()
         ) RETURNING *`,
        [
            Number(trip.trip_id),
            Number(trip.truck_id),
            Number(distanceRemaining.toFixed(3)),
            Number(currentSpeed.toFixed(2)),
            Number(historicalSpeed.toFixed(2)),
            Number(tripDistance.toFixed(2)),
            Number(etaMinutes.toFixed(2)),
            Number(delayProbability.toFixed(4))
        ]
    );

    return inserted.rows[0];
}

async function runAnalyticsWorker() {
    const activeTripsResult = await pool.query(
        `SELECT trip_id, truck_id, trip_distance, planned_end_time
         FROM trips
         WHERE LOWER(status) IN ('in_progress', 'running')
         ORDER BY trip_id ASC`
    );

    const predictions = [];

    for (const trip of activeTripsResult.rows) {
        try {
            const prediction = await analyzeTrip(trip);
            if (prediction) {
                predictions.push(prediction);
            }
        } catch (error) {
            console.error(`analytics worker failed for trip ${trip.trip_id}:`, error.message);
        }
    }

    return predictions;
}

function startWorker() {
    if (workerHandle) {
        return;
    }

    workerHandle = setInterval(() => {
        runAnalyticsWorker().catch((error) => {
            console.error('analytics worker cycle failed:', error.message);
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
            service: 'analytics-service',
            worker_running: Boolean(workerHandle),
            worker_interval_ms: WORKER_INTERVAL_MS,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.post('/analytics/worker/run', async (req, res) => {
    try {
        const predictions = await runAnalyticsWorker();
        return res.json({
            success: true,
            predictions_created: predictions.length,
            data: predictions
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/analytics/predictions/latest', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT DISTINCT ON (trip_id)
                prediction_id,
                trip_id,
                truck_id,
                distance_remaining,
                current_speed,
                historical_speed,
                trip_distance,
                eta_minutes,
                delay_probability,
                created_at
             FROM trip_predictions
             ORDER BY trip_id, created_at DESC`
        );

        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/analytics/predictions', async (req, res) => {
    const tripId = req.query.trip_id ? Number(req.query.trip_id) : null;

    try {
        const params = [];
        const where = [];

        if (tripId) {
            params.push(tripId);
            where.push(`trip_id = $${params.length}`);
        }

        const result = await pool.query(
            `SELECT *
             FROM trip_predictions
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY created_at DESC
             LIMIT 200`,
            params
        );

        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(async () => {
        await runAnalyticsWorker().catch(() => null);
        app.listen(PORT, () => {
            console.log(`analytics-service running on port ${PORT}`);
            startWorker();
        });
    })
    .catch((error) => {
        console.error('analytics-service startup failed:', error);
        process.exit(1);
    });
