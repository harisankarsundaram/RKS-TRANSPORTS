require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3107;

app.use(cors());
app.use(express.json());

function toRadians(deg) {
    return (deg * Math.PI) / 180;
}

function distanceKm(lat1, lon1, lat2, lon2) {
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
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

    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_trip ON alerts(trip_id)');
}

async function createAlertIfNotRecent({ truck_id, trip_id, alert_type, description }) {
    const existing = await pool.query(
        `SELECT id
         FROM alerts
         WHERE truck_id = $1
           AND COALESCE(trip_id, -1) = COALESCE($2, -1)
           AND alert_type = $3
           AND created_at >= NOW() - INTERVAL '3 hours'
         LIMIT 1`,
        [truck_id, trip_id || null, alert_type]
    );

    if (existing.rows.length > 0) {
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

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', service: 'analytics-service', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.get('/analytics/fuel/anomalies', async (req, res) => {
    const { trip_id } = req.query;

    try {
        const params = [];
        const where = ["LOWER(t.status) IN ('running', 'in_progress', 'completed')"];

        if (trip_id) {
            params.push(Number(trip_id));
            where.push(`t.trip_id = $${params.length}`);
        }

        const result = await pool.query(
            `SELECT
                t.trip_id,
                t.truck_id,
                COALESCE(NULLIF(t.gps_distance_km, 0), t.distance_km, 0) AS distance_km,
                COALESCE(tr.mileage_kmpl, 4.5) AS truck_mileage,
                COALESCE(SUM(COALESCE(f.fuel_filled, f.liters, 0)), 0) AS actual_fuel
             FROM trips t
             JOIN trucks tr ON tr.truck_id = t.truck_id
             LEFT JOIN fuel_logs f ON f.trip_id = t.trip_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             GROUP BY t.trip_id, t.truck_id, t.gps_distance_km, t.distance_km, tr.mileage_kmpl
             ORDER BY t.trip_id DESC`,
            params
        );

        const anomalies = [];
        const alerts = [];

        for (const row of result.rows) {
            const distance = Number(row.distance_km || 0);
            const mileage = Math.max(Number(row.truck_mileage || 4.5), 0.1);
            const actualFuel = Number(row.actual_fuel || 0);
            const expectedFuel = distance / mileage;
            const threshold = expectedFuel * 1.2;
            const isAnomaly = actualFuel > threshold && expectedFuel > 0;

            const item = {
                trip_id: row.trip_id,
                truck_id: row.truck_id,
                distance_km: Number(distance.toFixed(2)),
                truck_mileage: Number(mileage.toFixed(2)),
                expected_fuel: Number(expectedFuel.toFixed(2)),
                actual_fuel: Number(actualFuel.toFixed(2)),
                threshold: Number(threshold.toFixed(2)),
                is_anomaly: isAnomaly
            };

            if (isAnomaly) {
                anomalies.push(item);

                const alert = await createAlertIfNotRecent({
                    truck_id: row.truck_id,
                    trip_id: row.trip_id,
                    alert_type: 'fuel_anomaly',
                    description: `Fuel anomaly: expected ${item.expected_fuel}L, actual ${item.actual_fuel}L`
                });

                if (alert) {
                    alerts.push(alert);
                }
            }
        }

        return res.json({
            success: true,
            count: anomalies.length,
            data: anomalies,
            alerts_created: alerts.length,
            alerts
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/analytics/backhaul/suggestions', async (req, res) => {
    try {
        const completedTrips = await pool.query(
            `SELECT trip_id, truck_id, destination, end_time
             FROM trips
               WHERE LOWER(status) = 'completed'
             ORDER BY end_time DESC NULLS LAST
             LIMIT 100`
        );

        const pendingBookings = await pool.query(
            `SELECT id, pickup_location, destination, load_type, weight, offered_price,
                    pickup_latitude, pickup_longitude, pickup_date
             FROM booking_requests
             WHERE status = 'pending'
             ORDER BY pickup_date ASC, created_at ASC`
        );

        const suggestions = [];

        for (const trip of completedTrips.rows) {
            const latestLocation = await pool.query(
                `SELECT latitude, longitude
                 FROM gps_logs
                 WHERE truck_id = $1
                 ORDER BY recorded_at DESC
                 LIMIT 1`,
                [trip.truck_id]
            );

            if (latestLocation.rows.length === 0) {
                continue;
            }

            const truckLat = Number(latestLocation.rows[0].latitude);
            const truckLon = Number(latestLocation.rows[0].longitude);

            for (const booking of pendingBookings.rows) {
                if (booking.pickup_latitude === null || booking.pickup_longitude === null) {
                    continue;
                }

                const km = distanceKm(
                    truckLat,
                    truckLon,
                    Number(booking.pickup_latitude),
                    Number(booking.pickup_longitude)
                );

                if (km < 50) {
                    suggestions.push({
                        message: 'Backhaul opportunity detected',
                        trip_id: trip.trip_id,
                        truck_id: trip.truck_id,
                        booking_id: booking.id,
                        distance_to_pickup_km: Number(km.toFixed(2)),
                        pickup_location: booking.pickup_location,
                        destination: booking.destination,
                        offered_price: Number(booking.offered_price || 0),
                        load_type: booking.load_type,
                        weight: Number(booking.weight || 0)
                    });
                }
            }
        }

        suggestions.sort((a, b) => a.distance_to_pickup_km - b.distance_to_pickup_km);

        return res.json({ success: true, count: suggestions.length, data: suggestions.slice(0, 50) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/analytics/overview', async (req, res) => {
    try {
        const [fuel, backhaul] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*) FILTER (
                        WHERE COALESCE(NULLIF(t.gps_distance_km, 0), t.distance_km, 0) > 0
                          AND COALESCE(actual.actual_fuel, 0) > (
                                COALESCE(NULLIF(t.gps_distance_km, 0), t.distance_km, 0)
                                / GREATEST(COALESCE(tr.mileage_kmpl,4.5), 0.1)
                            ) * 1.2
                    ) AS anomaly_count
                FROM trips t
                JOIN trucks tr ON tr.truck_id = t.truck_id
                LEFT JOIN (
                    SELECT trip_id, SUM(COALESCE(fuel_filled, liters, 0)) AS actual_fuel
                    FROM fuel_logs
                    GROUP BY trip_id
                ) actual ON actual.trip_id = t.trip_id
                WHERE LOWER(t.status) IN ('running', 'in_progress', 'completed')
            `),
            pool.query(`SELECT COUNT(*) AS pending_booking_count FROM booking_requests WHERE status = 'pending'`)
        ]);

        return res.json({
            success: true,
            data: {
                fuel_anomaly_count: Number(fuel.rows[0]?.anomaly_count || 0),
                pending_booking_count: Number(backhaul.rows[0]?.pending_booking_count || 0)
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`analytics-service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('analytics-service startup failed:', error);
        process.exit(1);
    });
