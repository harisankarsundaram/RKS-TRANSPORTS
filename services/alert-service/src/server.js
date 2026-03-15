require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3208);

app.use(cors());
app.use(express.json());

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS alerts (
            id SERIAL PRIMARY KEY,
            truck_id INTEGER,
            trip_id INTEGER,
            alert_type VARCHAR(50) NOT NULL,
            description TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS fuel_logs (
            fuel_id SERIAL PRIMARY KEY,
            trip_id INTEGER,
            truck_id INTEGER,
            distance_km NUMERIC(10,2),
            mileage_kmpl NUMERIC(10,2),
            actual_fuel NUMERIC(10,2),
            liters NUMERIC(10,2),
            fuel_filled NUMERIC(10,2),
            timestamp TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS distance_km NUMERIC(10,2)');
    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS mileage_kmpl NUMERIC(10,2)');
    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS actual_fuel NUMERIC(10,2)');
    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS liters NUMERIC(10,2)');
    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS fuel_filled NUMERIC(10,2)');
    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP DEFAULT NOW()');

    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_type_phase2 ON alerts(alert_type)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_trip_phase2 ON alerts(trip_id)');
}

async function createAlertIfNotRecent({ truck_id, trip_id, alert_type, description }) {
    const duplicate = await pool.query(
        `SELECT id
         FROM alerts
         WHERE COALESCE(truck_id, -1) = COALESCE($1, -1)
           AND COALESCE(trip_id, -1) = COALESCE($2, -1)
           AND alert_type = $3
           AND created_at >= NOW() - INTERVAL '30 minutes'
         LIMIT 1`,
        [truck_id || null, trip_id || null, alert_type]
    );

    if (duplicate.rows.length > 0) {
        return null;
    }

    const inserted = await pool.query(
        `INSERT INTO alerts (truck_id, trip_id, alert_type, description, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING *`,
        [truck_id || null, trip_id || null, alert_type, description]
    );

    return inserted.rows[0];
}

async function evaluateOverspeed() {
    const result = await pool.query(
        `SELECT DISTINCT ON (g.trip_id)
            g.trip_id,
            g.truck_id,
            g.speed,
            g.timestamp
         FROM gps_logs g
         JOIN trips t ON t.trip_id = g.trip_id
         WHERE LOWER(t.status) IN ('in_progress', 'running')
         ORDER BY g.trip_id, g.timestamp DESC`
    );

    const created = [];

    for (const row of result.rows) {
        const speed = toNumber(row.speed);
        if (speed > 80) {
            const alert = await createAlertIfNotRecent({
                truck_id: toNumber(row.truck_id),
                trip_id: toNumber(row.trip_id),
                alert_type: 'overspeed',
                description: `Speed ${speed.toFixed(1)} km/h exceeded threshold 80 km/h`
            });

            if (alert) {
                created.push(alert);
            }
        }
    }

    return created;
}

async function evaluateIdle() {
    const activeTrips = await pool.query(
        `SELECT trip_id, truck_id
         FROM trips
         WHERE LOWER(status) IN ('in_progress', 'running')`
    );

    const created = [];

    for (const trip of activeTrips.rows) {
        const logs = await pool.query(
            `SELECT speed, timestamp
             FROM gps_logs
             WHERE trip_id = $1
               AND timestamp >= NOW() - INTERVAL '30 minutes'
             ORDER BY timestamp ASC`,
            [trip.trip_id]
        );

        if (logs.rows.length < 2) {
            continue;
        }

        const allIdle = logs.rows.every((item) => toNumber(item.speed) <= 1);
        const start = new Date(logs.rows[0].timestamp);
        const end = new Date(logs.rows[logs.rows.length - 1].timestamp);
        const minutes = (end - start) / (1000 * 60);

        if (allIdle && minutes >= 30) {
            const alert = await createAlertIfNotRecent({
                truck_id: toNumber(trip.truck_id),
                trip_id: toNumber(trip.trip_id),
                alert_type: 'idle_vehicle',
                description: `Truck idle for ${minutes.toFixed(1)} minutes`
            });

            if (alert) {
                created.push(alert);
            }
        }
    }

    return created;
}

async function evaluateDelayRisk() {
    const latestPredictions = await pool.query(
        `SELECT DISTINCT ON (trip_id)
            trip_id,
            truck_id,
            eta_minutes,
            delay_probability,
            created_at
         FROM trip_predictions
         ORDER BY trip_id, created_at DESC`
    );

    const created = [];

    for (const prediction of latestPredictions.rows) {
        const delayProbability = toNumber(prediction.delay_probability);

        if (delayProbability >= 0.6) {
            const alert = await createAlertIfNotRecent({
                truck_id: toNumber(prediction.truck_id),
                trip_id: toNumber(prediction.trip_id),
                alert_type: 'delay_risk',
                description: `Delay probability ${(delayProbability * 100).toFixed(1)}% with ETA ${toNumber(prediction.eta_minutes).toFixed(1)} min`
            });

            if (alert) {
                created.push(alert);
            }
        }
    }

    return created;
}

async function detectFuelAnomalies() {
    const fuelResult = await pool.query(
        `SELECT
            f.fuel_id,
            COALESCE(f.trip_id, t.trip_id) AS trip_id,
            COALESCE(f.truck_id, t.truck_id) AS truck_id,
            COALESCE(f.distance_km, t.trip_distance, 0) AS distance_km,
            COALESCE(NULLIF(f.mileage_kmpl, 0), tr.mileage_kmpl, 4.5) AS mileage_kmpl,
            COALESCE(f.actual_fuel, f.fuel_filled, f.liters, 0) AS actual_fuel
         FROM fuel_logs f
         LEFT JOIN trips t ON t.trip_id = f.trip_id
         LEFT JOIN trucks tr ON tr.truck_id = COALESCE(f.truck_id, t.truck_id)
         ORDER BY COALESCE(f.timestamp, f.created_at, NOW()) DESC
         LIMIT 500`
    );

    const anomalies = [];
    const alerts = [];

    for (const row of fuelResult.rows) {
        const distance = toNumber(row.distance_km);
        const mileage = Math.max(toNumber(row.mileage_kmpl, 4.5), 0.1);
        const actualFuel = toNumber(row.actual_fuel);
        const expectedFuel = distance / mileage;
        const threshold = expectedFuel * 1.2;

        if (expectedFuel > 0 && actualFuel > threshold) {
            const item = {
                fuel_id: toNumber(row.fuel_id),
                trip_id: row.trip_id !== null ? toNumber(row.trip_id) : null,
                truck_id: row.truck_id !== null ? toNumber(row.truck_id) : null,
                distance_km: Number(distance.toFixed(2)),
                mileage_kmpl: Number(mileage.toFixed(2)),
                expected_fuel: Number(expectedFuel.toFixed(2)),
                actual_fuel: Number(actualFuel.toFixed(2)),
                threshold: Number(threshold.toFixed(2)),
                is_anomaly: true
            };

            anomalies.push(item);

            const alert = await createAlertIfNotRecent({
                truck_id: item.truck_id,
                trip_id: item.trip_id,
                alert_type: 'fuel_anomaly',
                description: `Fuel anomaly: expected ${item.expected_fuel}L, actual ${item.actual_fuel}L`
            });

            if (alert) {
                alerts.push(alert);
            }
        }
    }

    return {
        anomalies,
        alerts
    };
}

async function evaluateAllAlerts() {
    const [overspeed, idle, delay, fuel] = await Promise.all([
        evaluateOverspeed(),
        evaluateIdle(),
        evaluateDelayRisk(),
        detectFuelAnomalies()
    ]);

    return {
        overspeed,
        idle,
        delay,
        fuel_anomalies: fuel.anomalies,
        fuel_alerts: fuel.alerts,
        all_created_alerts: [...overspeed, ...idle, ...delay, ...fuel.alerts]
    };
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({ status: 'OK', service: 'alert-service', timestamp: new Date().toISOString() });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.get('/alerts', async (req, res) => {
    const limit = Number(req.query.limit || 100);

    try {
        const result = await pool.query(
            `SELECT * FROM alerts ORDER BY created_at DESC LIMIT $1`,
            [limit]
        );

        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/alerts/evaluate', async (req, res) => {
    try {
        const result = await evaluateAllAlerts();
        return res.json({
            success: true,
            alerts_created: result.all_created_alerts.length,
            data: result
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/alerts/fuel-anomalies', async (req, res) => {
    try {
        const fuel = await detectFuelAnomalies();
        return res.json({
            success: true,
            count: fuel.anomalies.length,
            data: fuel.anomalies,
            alerts_created: fuel.alerts.length
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/alerts/fuel-logs', async (req, res) => {
    const {
        trip_id = null,
        truck_id = null,
        distance_km,
        mileage_kmpl,
        actual_fuel
    } = req.body;

    if (distance_km === undefined || mileage_kmpl === undefined || actual_fuel === undefined) {
        return res.status(400).json({ success: false, message: 'distance_km, mileage_kmpl and actual_fuel are required' });
    }

    try {
        const inserted = await pool.query(
            `INSERT INTO fuel_logs (
                trip_id,
                truck_id,
                distance_km,
                mileage_kmpl,
                actual_fuel,
                liters,
                fuel_filled,
                timestamp,
                created_at
             ) VALUES (
                $1,$2,$3,$4,$5,$5,$5,NOW(),NOW()
             ) RETURNING *`,
            [
                trip_id !== null ? Number(trip_id) : null,
                truck_id !== null ? Number(truck_id) : null,
                Number(distance_km),
                Number(mileage_kmpl),
                Number(actual_fuel)
            ]
        );

        return res.status(201).json({ success: true, data: inserted.rows[0] });
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
