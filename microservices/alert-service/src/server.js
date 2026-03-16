require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3108;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

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

function parsePolyline(raw) {
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((point) => {
                if (Array.isArray(point) && point.length >= 2) {
                    return {
                        longitude: Number(point[0]),
                        latitude: Number(point[1])
                    };
                }

                if (point && point.longitude !== undefined && point.latitude !== undefined) {
                    return {
                        longitude: Number(point.longitude),
                        latitude: Number(point.latitude)
                    };
                }

                return null;
            })
            .filter((point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude));
    } catch (error) {
        return [];
    }
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

function minDistanceToRoute(point, route) {
    if (!Array.isArray(route) || route.length === 0) {
        return 0;
    }

    let best = Number.POSITIVE_INFINITY;
    for (const routePoint of route) {
        const d = distanceKm(point, routePoint);
        if (d < best) {
            best = d;
        }
    }
    return best;
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

async function createAlertIfNotRecent({ truck_id, trip_id, alert_type, description }) {
    const duplicate = await pool.query(
        `SELECT id
         FROM alerts
         WHERE truck_id = $1
           AND COALESCE(trip_id, -1) = COALESCE($2, -1)
           AND alert_type = $3
           AND created_at >= NOW() - INTERVAL '30 minutes'
         LIMIT 1`,
        [truck_id, trip_id || null, alert_type]
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
    const currentPoint = {
        latitude: Number(latest.latitude),
        longitude: Number(latest.longitude)
    };
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

    const route = parsePolyline(trip.route_polyline);
    if (route.length > 0) {
        const deviationKm = minDistanceToRoute(currentPoint, route);
        if (deviationKm > 1.5) {
            const alert = await createAlertIfNotRecent({
                truck_id: trip.truck_id,
                trip_id: trip.trip_id,
                alert_type: 'route_deviation',
                description: `Truck deviated ${deviationKm.toFixed(2)} km from recommended route`
            });
            if (alert) {
                created.push(alert);
            }
        }
    }

    const logsResult = await pool.query(
        `SELECT latitude, longitude, COALESCE(speed_kmph, 0) AS speed, recorded_at
         FROM gps_logs
         WHERE trip_id = $1
         ORDER BY recorded_at ASC`,
        [trip.trip_id]
    );

    const logs = logsResult.rows.map((row) => ({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speed: Number(row.speed),
        recorded_at: row.recorded_at
    }));

    const logDistance = sumDistance(logs);
    const trackedDistance = Number(trip.gps_distance_km || 0);
    const routeDistance = route.length > 1 ? sumDistance(route) : 0;
    const totalDistance = Math.max(routeDistance, Number(trip.distance_km || 0), trackedDistance, logDistance);

    if (totalDistance > 0) {
        try {
            const travelledDistance = Math.max(logDistance, trackedDistance);
            const distanceRemaining = Math.max(totalDistance - travelledDistance, 0);

            const speedSamples = logs.map((item) => item.speed).filter((speed) => speed > 0);
            const historicalAvgSpeed = speedSamples.length
                ? speedSamples.reduce((sum, speed) => sum + speed, 0) / speedSamples.length
                : 45;

            const etaResponse = await axios.post(`${ML_SERVICE_URL}/predict/eta`, {
                distance_remaining: Number(distanceRemaining.toFixed(3)),
                current_speed: Number(currentSpeed.toFixed(2)),
                historical_avg_speed: Number(historicalAvgSpeed.toFixed(2)),
                trip_distance: Number(totalDistance.toFixed(3)),
                road_type: 'highway'
            }, { timeout: 12000 });

            const predictedEta = Number(etaResponse.data?.eta_minutes || 0);
            const plannedArrival = trip.planned_arrival_time || new Date(Date.now() + (120 * 60 * 1000)).toISOString();
            const trafficLevel = currentSpeed <= 25 ? 0.9 : currentSpeed <= 45 ? 0.6 : 0.35;

            const delayResponse = await axios.post(`${ML_SERVICE_URL}/predict/delay`, {
                planned_arrival_time: plannedArrival,
                predicted_eta: predictedEta,
                trip_distance: Number(totalDistance.toFixed(3)),
                traffic_level: trafficLevel
            }, { timeout: 12000 });

            const risk = Number(delayResponse.data?.delay_risk_percentage || 0);
            if (risk >= 60) {
                const alert = await createAlertIfNotRecent({
                    truck_id: trip.truck_id,
                    trip_id: trip.trip_id,
                    alert_type: 'delay_risk',
                    description: `Delay risk ${risk.toFixed(1)}% (ETA ${predictedEta.toFixed(1)} min)`
                });
                if (alert) {
                    created.push(alert);
                }
            }
        } catch (error) {
            console.warn(`Delay risk prediction skipped for trip ${trip.trip_id}: ${error.message}`);
        }
    }

    return created;
}

async function evaluateAlerts() {
    const runningTrips = await pool.query(
        `SELECT t.trip_id, t.truck_id,
                COALESCE(t.distance_km, 0) AS distance_km,
                COALESCE(t.gps_distance_km, 0) AS gps_distance_km,
                COALESCE(tr.route_polyline, t.route_polyline) AS route_polyline,
                t.planned_arrival_time
         FROM trips t
         LEFT JOIN trip_routes tr ON tr.trip_id = t.trip_id
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

    try {
        const result = await pool.query(
            `SELECT * FROM alerts ORDER BY created_at DESC LIMIT $1`,
            [Number(limit)]
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
