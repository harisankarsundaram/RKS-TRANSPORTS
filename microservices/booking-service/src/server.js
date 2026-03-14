require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3104;
const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || 'http://localhost:3103';

app.use(cors());
app.use(express.json());

async function geocode(location) {
    if (!location) {
        return null;
    }

    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            timeout: 12000,
            headers: {
                'User-Agent': 'rks-booking-service/1.0'
            },
            params: {
                q: location,
                format: 'json',
                limit: 1
            }
        });

        const hit = response.data?.[0];
        if (!hit) {
            return null;
        }

        return {
            latitude: Number(hit.lat),
            longitude: Number(hit.lon)
        };
    } catch (error) {
        return null;
    }
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS booking_requests (
            id SERIAL PRIMARY KEY,
            customer_name VARCHAR(120) NOT NULL,
            contact_number VARCHAR(20) NOT NULL,
            pickup_location VARCHAR(255) NOT NULL,
            destination VARCHAR(255) NOT NULL,
            load_type VARCHAR(120) NOT NULL,
            weight NUMERIC(10,2) NOT NULL,
            pickup_date DATE NOT NULL,
            delivery_deadline DATE NOT NULL,
            offered_price NUMERIC(12,2) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'pending',
            pickup_latitude NUMERIC(10,7),
            pickup_longitude NUMERIC(10,7),
            destination_latitude NUMERIC(10,7),
            destination_longitude NUMERIC(10,7),
            approved_trip_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_booking_requests_pickup_date ON booking_requests(pickup_date)');
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', service: 'booking-service', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

const createBooking = async (req, res) => {
    const {
        customer_name,
        contact_number,
        pickup_location,
        destination,
        load_type,
        weight,
        pickup_date,
        delivery_deadline,
        offered_price
    } = req.body;

    if (!pickup_location || !destination || !load_type || !weight || !pickup_date || !delivery_deadline || !contact_number || !offered_price || !customer_name) {
        return res.status(400).json({ success: false, message: 'All booking fields are required' });
    }

    try {
        const [pickupCoord, destinationCoord] = await Promise.all([
            geocode(pickup_location),
            geocode(destination)
        ]);

        const inserted = await pool.query(
            `INSERT INTO booking_requests (
                customer_name,
                contact_number,
                pickup_location,
                destination,
                load_type,
                weight,
                pickup_date,
                delivery_deadline,
                offered_price,
                status,
                pickup_latitude,
                pickup_longitude,
                destination_latitude,
                destination_longitude,
                created_at,
                updated_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13,NOW(),NOW()
            ) RETURNING *`,
            [
                customer_name,
                contact_number,
                pickup_location,
                destination,
                load_type,
                Number(weight),
                pickup_date,
                delivery_deadline,
                Number(offered_price),
                pickupCoord?.latitude || null,
                pickupCoord?.longitude || null,
                destinationCoord?.latitude || null,
                destinationCoord?.longitude || null
            ]
        );

        return res.status(201).json({ success: true, data: inserted.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const listBookings = async (req, res) => {
    const { status } = req.query;
    try {
        const params = [];
        const where = [];

        if (status) {
            params.push(status);
            where.push(`status = $${params.length}`);
        }

        const result = await pool.query(
            `SELECT * FROM booking_requests ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`,
            params
        );

        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const approveBooking = async (req, res) => {
    const bookingId = Number(req.params.id);
    const { truck_id, driver_id } = req.body;

    if (!truck_id || !driver_id) {
        return res.status(400).json({ success: false, message: 'truck_id and driver_id are required to approve booking' });
    }

    try {
        const bookingResult = await pool.query('SELECT * FROM booking_requests WHERE id = $1', [bookingId]);
        const booking = bookingResult.rows[0];

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.status !== 'pending') {
            return res.status(400).json({ success: false, message: `Booking is already ${booking.status}` });
        }

        const tripResponse = await axios.post(`${TRIP_SERVICE_URL}/trips`, {
            truck_id: Number(truck_id),
            driver_id: Number(driver_id),
            source: booking.pickup_location,
            destination: booking.destination,
            base_freight: Number(booking.offered_price),
            booking_request_id: booking.id,
            status: 'Planned'
        }, { timeout: 15000 });

        const createdTrip = tripResponse.data?.data;

        const updated = await pool.query(
            `UPDATE booking_requests
             SET status = 'approved', approved_trip_id = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [createdTrip?.trip_id || null, bookingId]
        );

        return res.json({ success: true, data: updated.rows[0], trip: createdTrip || null });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};

const rejectBooking = async (req, res) => {
    const bookingId = Number(req.params.id);

    try {
        const updated = await pool.query(
            `UPDATE booking_requests
             SET status = 'rejected', updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [bookingId]
        );

        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        return res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Primary booking API paths
app.post('/bookings', createBooking);
app.get('/bookings', listBookings);
app.post('/bookings/:id/approve', approveBooking);
app.post('/bookings/:id/reject', rejectBooking);

// Compatibility aliases matching requested contract
app.post('/booking/request', createBooking);
app.get('/booking/requests', listBookings);
app.post('/booking/approve/:id', approveBooking);

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
