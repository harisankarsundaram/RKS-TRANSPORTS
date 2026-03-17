require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3204);

app.use(cors());
app.use(express.json());

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS booking_requests (
            id SERIAL PRIMARY KEY,
            customer_id INTEGER,
            customer_name VARCHAR(120),
            pickup_location VARCHAR(255) NOT NULL,
            destination VARCHAR(255) NOT NULL,
            load_type VARCHAR(120) NOT NULL,
            weight NUMERIC(10,2) NOT NULL,
            pickup_date DATE NOT NULL,
            delivery_deadline DATE NOT NULL,
            contact_number VARCHAR(20) NOT NULL,
            offered_price NUMERIC(12,2) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
            pickup_latitude NUMERIC(10,7),
            pickup_longitude NUMERIC(10,7),
            destination_latitude NUMERIC(10,7),
            destination_longitude NUMERIC(10,7),
            approved_trip_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120)');
    await pool.query(`
        UPDATE booking_requests
        SET customer_name = COALESCE(customer_name, 'Customer')
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS customers (
            customer_id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE,
            name VARCHAR(120),
            contact_number VARCHAR(20) UNIQUE,
            email VARCHAR(255) UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_booking_status_phase1 ON booking_requests(status)');
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({ status: 'OK', service: 'booking-service', timestamp: new Date().toISOString() });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.post('/booking/request', async (req, res) => {
    const {
        customer_id,
        customer_name,
        pickup_location, destination,
        load_type, weight,
        pickup_date, delivery_deadline,
        contact_number, offered_price,
        pickup_latitude, pickup_longitude,
        destination_latitude, destination_longitude
    } = req.body;

    if (!pickup_location || !destination || !load_type || !weight || !pickup_date || !delivery_deadline || !contact_number || !offered_price) {
        return res.status(400).json({ success: false, message: 'Missing required booking fields' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO booking_requests (
                customer_id, customer_name, pickup_location, destination,
                load_type, weight, pickup_date, delivery_deadline,
                contact_number, offered_price, status,
                pickup_latitude, pickup_longitude,
                destination_latitude, destination_longitude,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, $13, $14, NOW(), NOW()
            ) RETURNING *`,
            [
                customer_id ? Number(customer_id) : null,
                customer_name || 'Customer',
                pickup_location, destination, load_type, Number(weight),
                pickup_date, delivery_deadline, contact_number, Number(offered_price),
                pickup_latitude !== undefined ? Number(pickup_latitude) : null,
                pickup_longitude !== undefined ? Number(pickup_longitude) : null,
                destination_latitude !== undefined ? Number(destination_latitude) : null,
                destination_longitude !== undefined ? Number(destination_longitude) : null,
            ]
        );

        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Alias for frontend compatibility
app.post('/bookings', async (req, res) => {
    const {
        customer_id, customer_name, pickup_location, destination, load_type, weight,
        pickup_date, delivery_deadline, contact_number, offered_price,
        pickup_latitude, pickup_longitude, destination_latitude, destination_longitude
    } = req.body;

    if (!pickup_location || !destination || !load_type || !weight || !pickup_date || !delivery_deadline || !contact_number || !offered_price) {
        return res.status(400).json({ success: false, message: 'Missing required booking fields' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO booking_requests (
                customer_id, customer_name, pickup_location, destination,
                load_type, weight, pickup_date, delivery_deadline,
                contact_number, offered_price, status,
                pickup_latitude, pickup_longitude,
                destination_latitude, destination_longitude,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, $13, $14, NOW(), NOW()
            ) RETURNING *`,
            [
                customer_id ? Number(customer_id) : null,
                customer_name || 'Customer',
                pickup_location, destination, load_type, Number(weight),
                pickup_date, delivery_deadline, contact_number, Number(offered_price),
                pickup_latitude !== undefined ? Number(pickup_latitude) : null, pickup_longitude !== undefined ? Number(pickup_longitude) : null,
                destination_latitude !== undefined ? Number(destination_latitude) : null, destination_longitude !== undefined ? Number(destination_longitude) : null,
            ]
        );
        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/booking/requests', async (req, res) => {
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
            FROM booking_requests
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, params);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Alias for frontend compatibility
app.get('/bookings', async (req, res) => {
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
            FROM booking_requests
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, params);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/booking/requests/:id/status', async (req, res) => {
    const bookingId = Number(req.params.id);
    const { status, approved_trip_id } = req.body;

    if (!Number.isFinite(bookingId)) {
        return res.status(400).json({ success: false, message: 'Invalid booking id' });
    }

    const normalizedStatus = String(status || '').toLowerCase();
    const allowed = new Set(['pending', 'approved', 'rejected']);
    if (!allowed.has(normalizedStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid booking status' });
    }

    try {
        const result = await pool.query(
            `UPDATE booking_requests
             SET status = $1, approved_trip_id = COALESCE($2, approved_trip_id), updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [
                normalizedStatus,
                approved_trip_id ? Number(approved_trip_id) : null,
                bookingId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking request not found' });
        }

        return res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`booking-service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('booking-service startup failed:', error);
        process.exit(1);
    });
