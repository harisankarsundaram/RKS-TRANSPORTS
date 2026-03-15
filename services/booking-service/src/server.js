require('dotenv').config();

const axios = require('axios');
const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3204);
const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || 'http://localhost:3203';

app.use(cors());
app.use(express.json());

const ALLOWED_STATUS = new Set(['pending', 'approved', 'rejected']);

async function ensureSchema() {
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

    await pool.query(`
        CREATE TABLE IF NOT EXISTS booking_requests (
            id SERIAL PRIMARY KEY,
            customer_id INTEGER,
            pickup_location VARCHAR(255) NOT NULL,
            destination VARCHAR(255) NOT NULL,
            load_type VARCHAR(120) NOT NULL,
            weight NUMERIC(10,2) NOT NULL,
            pickup_date DATE NOT NULL,
            delivery_deadline DATE NOT NULL,
            contact_number VARCHAR(20) NOT NULL,
            offered_price NUMERIC(12,2) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
            approved_trip_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_booking_requests_status_phase1 ON booking_requests(status)');
}

async function resolveCustomer({ customer_name = null, customer_email = null, contact_number }) {
    const existing = await pool.query(
        'SELECT * FROM customers WHERE contact_number = $1',
        [contact_number]
    );

    if (existing.rows.length > 0) {
        return existing.rows[0];
    }

    const inserted = await pool.query(
        `INSERT INTO customers (name, email, contact_number)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [customer_name, customer_email, contact_number]
    );

    return inserted.rows[0];
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
        pickup_location,
        destination,
        load_type,
        weight,
        pickup_date,
        delivery_deadline,
        contact_number,
        offered_price,
        status = 'pending',
        customer_name = null,
        customer_email = null
    } = req.body;

    if (!pickup_location || !destination || !load_type || !weight || !pickup_date || !delivery_deadline || !contact_number || !offered_price) {
        return res.status(400).json({
            success: false,
            message: 'pickup_location, destination, load_type, weight, pickup_date, delivery_deadline, contact_number and offered_price are required'
        });
    }

    const normalizedStatus = String(status).toLowerCase();
    if (!ALLOWED_STATUS.has(normalizedStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid booking status' });
    }

    try {
        const customer = await resolveCustomer({ customer_name, customer_email, contact_number });

        const result = await pool.query(
            `INSERT INTO booking_requests (
                customer_id,
                pickup_location,
                destination,
                load_type,
                weight,
                pickup_date,
                delivery_deadline,
                contact_number,
                offered_price,
                status,
                created_at,
                updated_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()
            ) RETURNING *`,
            [
                customer.customer_id,
                pickup_location,
                destination,
                load_type,
                Number(weight),
                pickup_date,
                delivery_deadline,
                contact_number,
                Number(offered_price),
                normalizedStatus
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
            const normalizedStatus = String(status).toLowerCase();
            params.push(normalizedStatus);
            where.push(`b.status = $${params.length}`);
        }

        const query = `
            SELECT b.*, c.name AS customer_name, c.email AS customer_email
            FROM booking_requests b
            LEFT JOIN customers c ON b.customer_id = c.customer_id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY b.created_at DESC
        `;

        const result = await pool.query(query, params);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/booking/approve/:id', async (req, res) => {
    const bookingId = Number(req.params.id);
    const {
        truck_id,
        driver_id,
        planned_start_time = null,
        planned_end_time = null
    } = req.body;

    if (!Number.isFinite(bookingId)) {
        return res.status(400).json({ success: false, message: 'Invalid booking id' });
    }

    if (!truck_id || !driver_id) {
        return res.status(400).json({ success: false, message: 'truck_id and driver_id are required' });
    }

    try {
        const bookingResult = await pool.query('SELECT * FROM booking_requests WHERE id = $1', [bookingId]);
        const booking = bookingResult.rows[0];

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking request not found' });
        }

        if (booking.status !== 'pending') {
            return res.status(400).json({ success: false, message: `Booking is already ${booking.status}` });
        }

        const tripResponse = await axios.post(`${TRIP_SERVICE_URL}/trips`, {
            truck_id: Number(truck_id),
            driver_id: Number(driver_id),
            source: booking.pickup_location,
            destination: booking.destination,
            trip_distance: 0,
            planned_start_time,
            planned_end_time,
            status: 'planned',
            booking_request_id: booking.id
        }, { timeout: 15000 });

        const createdTrip = tripResponse.data?.data;

        const updateResult = await pool.query(
            `UPDATE booking_requests
             SET status = 'approved', approved_trip_id = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [createdTrip?.trip_id || null, bookingId]
        );

        return res.json({
            success: true,
            data: updateResult.rows[0],
            trip: createdTrip || null
        });
    } catch (error) {
        return res.status(502).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
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
