require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3202);

app.use(cors());
app.use(express.json());

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS trucks (
            truck_id SERIAL PRIMARY KEY,
            truck_number VARCHAR(50) UNIQUE NOT NULL,
            capacity_tons NUMERIC(10,2) NOT NULL,
            mileage_kmpl NUMERIC(10,2) NOT NULL,
            status VARCHAR(20) NOT NULL CHECK(status IN ('available', 'assigned', 'maintenance')),
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS drivers (
            driver_id SERIAL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            license_number VARCHAR(80) UNIQUE NOT NULL,
            status VARCHAR(20) NOT NULL CHECK(status IN ('available', 'assigned', 'inactive')),
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_trucks_status_phase1 ON trucks(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_drivers_status_phase1 ON drivers(status)');
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({ status: 'OK', service: 'fleet-service', timestamp: new Date().toISOString() });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.post('/trucks', async (req, res) => {
    const {
        truck_number,
        capacity_tons,
        mileage_kmpl = 4.5,
        status = 'available'
    } = req.body;

    if (!truck_number || capacity_tons === undefined) {
        return res.status(400).json({ success: false, message: 'truck_number and capacity_tons are required' });
    }

    const normalizedStatus = String(status).toLowerCase();
    const allowed = new Set(['available', 'assigned', 'maintenance']);
    if (!allowed.has(normalizedStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid truck status' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO trucks (truck_number, capacity_tons, mileage_kmpl, status)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [String(truck_number).toUpperCase(), Number(capacity_tons), Number(mileage_kmpl), normalizedStatus]
        );

        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/trucks', async (req, res) => {
    const { status } = req.query;

    try {
        const params = [];
        const where = [];

        if (status) {
            params.push(String(status).toLowerCase());
            where.push(`status = $${params.length}`);
        }

        const query = `
            SELECT *
            FROM trucks
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, params);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/drivers', async (req, res) => {
    const {
        name,
        phone,
        license_number,
        status = 'available'
    } = req.body;

    if (!name || !phone || !license_number) {
        return res.status(400).json({ success: false, message: 'name, phone and license_number are required' });
    }

    const normalizedStatus = String(status).toLowerCase();
    const allowed = new Set(['available', 'assigned', 'inactive']);
    if (!allowed.has(normalizedStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid driver status' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO drivers (name, phone, license_number, status)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [name, phone, license_number, normalizedStatus]
        );

        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/drivers', async (req, res) => {
    const { status } = req.query;

    try {
        const params = [];
        const where = [];

        if (status) {
            params.push(String(status).toLowerCase());
            where.push(`status = $${params.length}`);
        }

        const query = `
            SELECT *
            FROM drivers
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, params);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`fleet-service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('fleet-service startup failed:', error);
        process.exit(1);
    });
