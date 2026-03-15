require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3203);

app.use(cors());
app.use(express.json());

const ALLOWED_STATUS = new Set(['planned', 'in_progress', 'completed', 'cancelled']);

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS trips (
            trip_id SERIAL PRIMARY KEY,
            truck_id INTEGER NOT NULL,
            driver_id INTEGER NOT NULL,
            source VARCHAR(140) NOT NULL,
            destination VARCHAR(140) NOT NULL,
            trip_distance NUMERIC(10,2) NOT NULL DEFAULT 0,
            planned_start_time TIMESTAMP,
            planned_end_time TIMESTAMP,
            status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'in_progress', 'completed', 'cancelled')),
            booking_request_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_trips_status_phase1 ON trips(status)');
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({ status: 'OK', service: 'trip-service', timestamp: new Date().toISOString() });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.post('/trips', async (req, res) => {
    const {
        truck_id,
        driver_id,
        source,
        destination,
        trip_distance = 0,
        planned_start_time = null,
        planned_end_time = null,
        status = 'planned',
        booking_request_id = null
    } = req.body;

    if (!truck_id || !driver_id || !source || !destination) {
        return res.status(400).json({
            success: false,
            message: 'truck_id, driver_id, source and destination are required'
        });
    }

    const normalizedStatus = String(status).toLowerCase();
    if (!ALLOWED_STATUS.has(normalizedStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid trip status' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO trips (
                truck_id,
                driver_id,
                source,
                destination,
                trip_distance,
                planned_start_time,
                planned_end_time,
                status,
                booking_request_id,
                created_at,
                updated_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()
            ) RETURNING *`,
            [
                Number(truck_id),
                Number(driver_id),
                source,
                destination,
                Number(trip_distance),
                planned_start_time,
                planned_end_time,
                normalizedStatus,
                booking_request_id !== null ? Number(booking_request_id) : null
            ]
        );

        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/trips', async (req, res) => {
    const { status } = req.query;

    try {
        const params = [];
        const where = [];

        if (status) {
            const normalizedStatus = String(status).toLowerCase();
            params.push(normalizedStatus);
            where.push(`status = $${params.length}`);
        }

        const query = `
            SELECT *
            FROM trips
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, params);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/trips/:id', async (req, res) => {
    const tripId = Number(req.params.id);
    if (!Number.isFinite(tripId)) {
        return res.status(400).json({ success: false, message: 'Invalid trip id' });
    }

    try {
        const result = await pool.query('SELECT * FROM trips WHERE trip_id = $1', [tripId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        return res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/trips/:id/status', async (req, res) => {
    const tripId = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isFinite(tripId)) {
        return res.status(400).json({ success: false, message: 'Invalid trip id' });
    }

    const normalizedStatus = String(status || '').toLowerCase();
    if (!ALLOWED_STATUS.has(normalizedStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid trip status' });
    }

    try {
        const result = await pool.query(
            `UPDATE trips
             SET status = $1, updated_at = NOW()
             WHERE trip_id = $2
             RETURNING *`,
            [normalizedStatus, tripId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        return res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`trip-service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('trip-service startup failed:', error);
        process.exit(1);
    });
