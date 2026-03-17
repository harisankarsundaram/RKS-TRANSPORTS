require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3208);

app.use(cors());
app.use(express.json());

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
            price_per_liter NUMERIC(10,2),
            total_cost NUMERIC(12,2),
            timestamp TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS price_per_liter NUMERIC(10,2) DEFAULT 0');
    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2) DEFAULT 0');
    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()');
    await pool.query('UPDATE fuel_logs SET created_at = COALESCE(created_at, NOW())');
    await pool.query('UPDATE fuel_logs SET liters = COALESCE(liters, actual_fuel, fuel_filled, 0)');
    await pool.query('UPDATE fuel_logs SET fuel_filled = COALESCE(fuel_filled, liters, actual_fuel, 0)');
    await pool.query('UPDATE fuel_logs SET total_cost = COALESCE(total_cost, COALESCE(liters, 0) * COALESCE(price_per_liter, 0), 0)');

    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_type_phase1 ON alerts(alert_type)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alert_fuel_logs_trip_phase1 ON fuel_logs(trip_id)');
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({ status: 'OK', service: 'alert-service', timestamp: new Date().toISOString() });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

// ========== ALERTS ==========
app.get('/alerts', async (req, res) => {
    const { truck_id, trip_id, alert_type, limit = 50 } = req.query;

    try {
        const params = [];
        const where = [];

        if (truck_id) {
            params.push(Number(truck_id));
            where.push(`truck_id = $${params.length}`);
        }

        if (trip_id) {
            params.push(Number(trip_id));
            where.push(`trip_id = $${params.length}`);
        }

        if (alert_type) {
            params.push(String(alert_type));
            where.push(`alert_type = $${params.length}`);
        }

        params.push(Number(limit));

        const query = `
            SELECT *
            FROM alerts
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY created_at DESC
            LIMIT $${params.length}
        `;

        const result = await pool.query(query, params);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/alerts', async (req, res) => {
    const { truck_id, trip_id, alert_type, description } = req.body;

    if (!alert_type || !description) {
        return res.status(400).json({ success: false, message: 'alert_type and description are required' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO alerts (truck_id, trip_id, alert_type, description)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [
                truck_id ? Number(truck_id) : null,
                trip_id ? Number(trip_id) : null,
                alert_type,
                description
            ]
        );

        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ========== FUEL LOGS (Frontend explicitly expects /fuel endpoints) ==========
app.get('/fuel', async (req, res) => {
    const driverId = req.query.driver_id ? Number(req.query.driver_id) : null;

    if (req.query.driver_id && !Number.isFinite(driverId)) {
        return res.status(400).json({ success: false, message: 'Invalid driver_id value' });
    }

    try {
        const params = [];
        const where = [];

        if (driverId !== null) {
            params.push(driverId);
            where.push(`trp.driver_id = $${params.length}`);
        }

        const result = await pool.query(`
            SELECT
                f.fuel_id,
                f.trip_id,
                COALESCE(f.truck_id, trp.truck_id) AS truck_id,
                COALESCE(tr.truck_number, t.truck_number) AS truck_number,
                trp.lr_number,
                COALESCE(f.liters, f.actual_fuel, f.fuel_filled, 0) AS liters,
                COALESCE(f.price_per_liter, 0) AS price_per_liter,
                COALESCE(f.total_cost, COALESCE(f.liters, 0) * COALESCE(f.price_per_liter, 0), 0) AS total_cost,
                f.distance_km,
                f.mileage_kmpl,
                f.actual_fuel,
                COALESCE(f.timestamp, f.created_at) AS timestamp,
                COALESCE(f.created_at, f.timestamp) AS created_at
            FROM fuel_logs f
            LEFT JOIN trucks t ON t.truck_id = f.truck_id
            LEFT JOIN trips trp ON trp.trip_id = f.trip_id
            LEFT JOIN trucks tr ON tr.truck_id = trp.truck_id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY COALESCE(f.timestamp, f.created_at) DESC
        `, params);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/fuel', async (req, res) => {
    const {
        trip_id = null,
        truck_id = null,
        distance_km = 0,
        mileage_kmpl = 4.5,
        actual_fuel = 0,
        liters,
        fuel_filled,
        price_per_liter = 0,
        total_cost = null
    } = req.body;

    try {
        const numericTripId = trip_id !== null ? Number(trip_id) : null;
        let numericTruckId = truck_id !== null ? Number(truck_id) : null;
        let resolvedDistance = Number(distance_km || 0);

        if (numericTripId !== null && !Number.isFinite(numericTripId)) {
            return res.status(400).json({ success: false, message: 'Invalid trip_id value' });
        }

        if (numericTruckId !== null && !Number.isFinite(numericTruckId)) {
            return res.status(400).json({ success: false, message: 'Invalid truck_id value' });
        }

        if (numericTripId !== null) {
            const tripResult = await pool.query(
                `SELECT trip_id, truck_id, COALESCE(distance_km, trip_distance, 0) AS trip_distance
                 FROM trips
                 WHERE trip_id = $1`,
                [numericTripId]
            );

            if (tripResult.rows.length > 0) {
                const trip = tripResult.rows[0];
                if (numericTruckId === null) {
                    numericTruckId = Number(trip.truck_id);
                }
                if (!resolvedDistance || resolvedDistance <= 0) {
                    resolvedDistance = Number(trip.trip_distance || 0);
                }
            }
        }

        const litersValue = Number(actual_fuel || liters || fuel_filled || 0);
        const priceValue = Number(price_per_liter || 0);
        const totalCostValue = total_cost !== null && total_cost !== undefined
            ? Number(total_cost)
            : Number((litersValue * priceValue).toFixed(2));

        const result = await pool.query(
            `INSERT INTO fuel_logs (
                trip_id, truck_id, distance_km, mileage_kmpl,
                actual_fuel, liters, fuel_filled,
                price_per_liter, total_cost,
                timestamp, created_at
             )
             VALUES ($1, $2, $3, $4, $5, $5, $5, $6, $7, NOW(), NOW())
             RETURNING *`,
            [
                numericTripId,
                numericTruckId,
                Number(resolvedDistance || 0),
                Number(mileage_kmpl || 4.5),
                litersValue,
                priceValue,
                totalCostValue
            ]
        );
        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/fuel/:id', async (req, res) => {
    const fuelId = Number(req.params.id);
    if (!Number.isFinite(fuelId)) {
        return res.status(400).json({ success: false, message: 'Invalid fuel id' });
    }

    try {
        const result = await pool.query(
            `DELETE FROM fuel_logs WHERE fuel_id = $1 RETURNING fuel_id`,
            [fuelId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Fuel log not found' });
        }

        return res.json({ success: true, message: 'Fuel log deleted successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/alerts/fuel-anomalies', async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 80)));

    try {
        const result = await pool.query(
            `SELECT
                f.trip_id,
                COALESCE(NULLIF(f.distance_km, 0), COALESCE(t.trip_distance, 0), 0) AS distance_km,
                COALESCE(NULLIF(f.mileage_kmpl, 0), NULLIF(tr.mileage_kmpl, 0), 4.5) AS mileage_kmpl,
                COALESCE(NULLIF(f.actual_fuel, 0), NULLIF(f.liters, 0), NULLIF(f.fuel_filled, 0), 0) AS actual_fuel,
                COALESCE(f.timestamp, f.created_at) AS observed_at
             FROM fuel_logs f
             LEFT JOIN trips t ON t.trip_id = f.trip_id
             LEFT JOIN trucks tr ON tr.truck_id = COALESCE(f.truck_id, t.truck_id)
             ORDER BY COALESCE(f.timestamp, f.created_at) DESC
             LIMIT $1`,
            [limit]
        );

        const anomalies = result.rows
            .map((row) => {
                const distance = Number(row.distance_km || 0);
                const mileage = Number(row.mileage_kmpl || 0);
                const actual = Number(row.actual_fuel || 0);
                const expected = mileage > 0 ? distance / mileage : 0;

                return {
                    trip_id: row.trip_id,
                    expected_fuel: Number(expected.toFixed(2)),
                    actual_fuel: Number(actual.toFixed(2)),
                    observed_at: row.observed_at
                };
            })
            .filter((item) => item.expected_fuel > 0 && item.actual_fuel > (item.expected_fuel * 1.1));

        return res.json({ success: true, count: anomalies.length, data: anomalies });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Fake intelligence evaluator for alerts if needed
app.post('/alerts/evaluate', async (req, res) => {
    return res.json({ success: true, message: 'Evaluated automatically' });
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
