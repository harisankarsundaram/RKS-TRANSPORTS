require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3203);

app.use(cors());
app.use(express.json());

const ALLOWED_STATUS = new Set(['planned', 'in_progress', 'completed', 'cancelled']);

async function getTableColumns(tableName) {
    const result = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
    );

    return new Set(result.rows.map((row) => row.column_name));
}

function normalizeStatusForStorage(status) {
    const normalized = String(status || '').trim().toLowerCase();

    if (normalized === 'planned') {
        return 'planned';
    }

    if (normalized === 'in_progress' || normalized === 'running') {
        return 'in_progress';
    }

    if (normalized === 'completed') {
        return 'completed';
    }

    if (normalized === 'cancelled' || normalized === 'canceled') {
        return 'cancelled';
    }

    return null;
}

function mapStatusForUi(status) {
    const normalized = String(status || '').toLowerCase();

    if (normalized === 'planned') {
        return 'Planned';
    }

    if (normalized === 'in_progress' || normalized === 'running') {
        return 'Running';
    }

    if (normalized === 'completed') {
        return 'Completed';
    }

    if (normalized === 'cancelled' || normalized === 'canceled') {
        return 'Cancelled';
    }

    return status;
}

function mapTripForUi(row) {
    if (!row) {
        return row;
    }

    return {
        ...row,
        status: mapStatusForUi(row.status)
    };
}

function buildStatusFilter(status) {
    const normalized = String(status || '').trim().toLowerCase();

    if (normalized === 'running' || normalized === 'in_progress') {
        return ['running', 'in_progress'];
    }

    if (normalized === 'cancelled' || normalized === 'canceled') {
        return ['cancelled', 'canceled'];
    }

    return [normalized];
}

function isPlannedStatus(status) {
    return String(status || '').trim().toLowerCase() === 'planned';
}

function isRunningStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'running' || normalized === 'in_progress';
}

async function setTruckStatus(truckId, status) {
    await pool.query(
        `UPDATE trucks SET status = $1 WHERE truck_id = $2`,
        [status, Number(truckId)]
    );
}

async function setDriverAssignment(driverId, status, assignedTruckId = null) {
    const columns = await getTableColumns('drivers');
    const hasAssignedTruckId = columns.has('assigned_truck_id');

    if (hasAssignedTruckId) {
        await pool.query(
            `UPDATE drivers
             SET status = $1,
                 assigned_truck_id = $2
             WHERE driver_id = $3`,
            [status, assignedTruckId, Number(driverId)]
        );
        return;
    }

    await pool.query(
        `UPDATE drivers
         SET status = $1
         WHERE driver_id = $2`,
        [status, Number(driverId)]
    );
}

async function updateTripStatusWithFallback(tripId, statusCandidates, extraSetClause = '') {
    let lastConstraintError = null;

    for (const candidate of statusCandidates) {
        try {
            const result = await pool.query(
                `UPDATE trips
                 SET status = $1${extraSetClause ? `, ${extraSetClause}` : ''}, updated_at = NOW()
                 WHERE trip_id = $2
                 RETURNING *`,
                [candidate, tripId]
            );

            return result.rows[0] || null;
        } catch (error) {
            if (error.code === '23514') {
                lastConstraintError = error;
                continue;
            }

            throw error;
        }
    }

    if (lastConstraintError) {
        throw lastConstraintError;
    }

    return null;
}

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

    await pool.query(`
        CREATE TABLE IF NOT EXISTS expenses (
            expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            trip_id INTEGER,
            truck_id INTEGER,
            category VARCHAR(50) NOT NULL CHECK(category IN ('Fuel', 'Toll', 'Maintenance', 'Driver', 'RTO', 'Insurance', 'Misc')),
            amount NUMERIC(12,2) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS invoices (
            invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            trip_id INTEGER,
            invoice_number VARCHAR(50) UNIQUE NOT NULL,
            invoice_date DATE NOT NULL,
            due_date DATE NOT NULL,
            subtotal NUMERIC(12,2) NOT NULL,
            gst_amount NUMERIC(12,2) NOT NULL,
            total_amount NUMERIC(12,2) NOT NULL,
            payment_status VARCHAR(20) DEFAULT 'Pending' CHECK(payment_status IN ('Pending', 'Partial', 'Paid')),
            amount_paid NUMERIC(12,2) DEFAULT 0,
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

    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS lr_number VARCHAR(50)');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS distance_km NUMERIC(10,2) DEFAULT 0');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS start_time TIMESTAMP');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS end_time TIMESTAMP');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_polyline TEXT');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS planned_arrival_time TIMESTAMP');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS base_freight NUMERIC(12,2) DEFAULT 0');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS toll_amount NUMERIC(12,2) DEFAULT 0');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS loading_cost NUMERIC(12,2) DEFAULT 0');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS unloading_cost NUMERIC(12,2) DEFAULT 0');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS fast_tag NUMERIC(12,2) DEFAULT 0');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS gst_percentage NUMERIC(5,2) DEFAULT 0');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_bata NUMERIC(12,2) DEFAULT 0');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS empty_km NUMERIC(10,2) DEFAULT 0');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS loaded_km NUMERIC(10,2) DEFAULT 0');
    await pool.query(`
        DO $$
        BEGIN
            ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;
            ALTER TABLE trips ADD CONSTRAINT trips_status_check CHECK (LOWER(status) IN ('planned', 'running', 'in_progress', 'completed', 'cancelled', 'canceled'));
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END $$;
    `);
    await pool.query("UPDATE trips SET status = LOWER(COALESCE(status, 'planned'))");
    await pool.query('UPDATE trips SET distance_km = COALESCE(distance_km, trip_distance, 0)');
    await pool.query('UPDATE trips SET trip_distance = COALESCE(trip_distance, distance_km, 0)');

    await pool.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()');
    await pool.query('UPDATE expenses SET created_at = COALESCE(created_at, NOW())');

    await pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0');
    await pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT \'Pending\'');
    await pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()');
    await pool.query('UPDATE invoices SET amount_paid = COALESCE(amount_paid, 0)');
    await pool.query(`
        DO $$
        BEGIN
            ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
            ALTER TABLE invoices ADD CONSTRAINT invoices_payment_status_check CHECK (payment_status IN ('Pending', 'Partial', 'Paid'));
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END $$;
    `);
    await pool.query(`
        UPDATE invoices
        SET
            payment_status = CASE
                WHEN COALESCE(total_amount, 0) <= 0 OR COALESCE(amount_paid, 0) <= 0 THEN 'Pending'
                WHEN COALESCE(amount_paid, 0) >= COALESCE(total_amount, 0) THEN 'Paid'
                ELSE 'Partial'
            END,
            created_at = COALESCE(created_at, NOW())
    `);

    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS price_per_liter NUMERIC(10,2) DEFAULT 0');
    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2) DEFAULT 0');
    await pool.query('ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()');
    await pool.query('UPDATE fuel_logs SET created_at = COALESCE(created_at, NOW())');
    await pool.query('UPDATE fuel_logs SET liters = COALESCE(liters, actual_fuel, fuel_filled, 0)');
    await pool.query('UPDATE fuel_logs SET fuel_filled = COALESCE(fuel_filled, liters, actual_fuel, 0)');
    await pool.query('UPDATE fuel_logs SET total_cost = COALESCE(total_cost, COALESCE(liters, 0) * COALESCE(price_per_liter, 0), 0)');

    await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_trips_status_phase1 ON trips(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_invoices_trip_id ON invoices(trip_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_fuel_logs_trip_id_phase1 ON fuel_logs(trip_id)');
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({ status: 'OK', service: 'trip-service', timestamp: new Date().toISOString() });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

// ========== TRIPS ==========

app.post('/trips', async (req, res) => {
    const {
        truck_id,
        driver_id,
        lr_number,
        source,
        destination,
        trip_distance = 0,
        distance_km,
        base_freight = 0,
        toll_amount = 0,
        loading_cost = 0,
        unloading_cost = 0,
        fast_tag,
        other_charges,
        gst_percentage = 0,
        driver_bata = 0,
        empty_km = 0,
        loaded_km = 0,
        start_time = null,
        planned_start_time = null,
        planned_arrival_time = null,
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

    const normalizedStatus = normalizeStatusForStorage(status);
    if (!normalizedStatus || !ALLOWED_STATUS.has(normalizedStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid trip status' });
    }

    try {
        const numericTruckId = Number(truck_id);
        const numericDriverId = Number(driver_id);

        const [truckResult, driverResult] = await Promise.all([
            pool.query('SELECT truck_id, status FROM trucks WHERE truck_id = $1', [numericTruckId]),
            pool.query('SELECT driver_id, status FROM drivers WHERE driver_id = $1', [numericDriverId])
        ]);

        if (truckResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Truck not found' });
        }

        if (driverResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        if (String(truckResult.rows[0].status || '').toLowerCase() === 'maintenance') {
            return res.status(400).json({ success: false, message: 'Truck is under maintenance' });
        }

        if (String(driverResult.rows[0].status || '').toLowerCase() === 'inactive') {
            return res.status(400).json({ success: false, message: 'Driver is inactive' });
        }

        const lrNumber = (lr_number && String(lr_number).trim())
            ? String(lr_number).trim()
            : `LR-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

        const emptyKmValue = Number(empty_km || 0);
        const loadedKmValue = Number(loaded_km || 0);
        const explicitDistance = Number(distance_km ?? trip_distance ?? 0);
        const computedDistance = emptyKmValue + loadedKmValue;
        const distanceValue = Number.isFinite(explicitDistance) && explicitDistance > 0
            ? explicitDistance
            : computedDistance;

        const fastTagValue = Number(fast_tag ?? other_charges ?? 0);
        const startTimeValue = normalizedStatus === 'in_progress' ? (start_time || new Date()) : start_time;

        const result = await pool.query(
            `INSERT INTO trips (
                truck_id, driver_id, lr_number, source, destination,
                distance_km, trip_distance, base_freight, toll_amount,
                loading_cost, unloading_cost, fast_tag, gst_percentage, driver_bata,
                empty_km, loaded_km, start_time, planned_start_time,
                planned_arrival_time, planned_end_time,
                status, booking_request_id, created_at, updated_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),NOW()
            ) RETURNING *`,
            [
                numericTruckId,
                numericDriverId,
                lrNumber,
                source,
                destination,
                Number(distanceValue || 0),
                Number(base_freight || 0),
                Number(toll_amount || 0),
                Number(loading_cost || 0),
                Number(unloading_cost || 0),
                Number(fastTagValue || 0),
                Number(gst_percentage || 0),
                Number(driver_bata || 0),
                Number(emptyKmValue || 0),
                Number(loadedKmValue || 0),
                startTimeValue,
                planned_start_time,
                planned_arrival_time,
                planned_end_time,
                normalizedStatus,
                booking_request_id !== null ? Number(booking_request_id) : null
            ]
        );

        await Promise.all([
            setTruckStatus(numericTruckId, 'assigned'),
            setDriverAssignment(numericDriverId, 'assigned', numericTruckId)
        ]);

        const enriched = await pool.query(
            `SELECT t.*, tr.truck_number, d.name AS driver_name
             FROM trips t
             LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
             LEFT JOIN drivers d ON d.driver_id = t.driver_id
             WHERE t.trip_id = $1`,
            [result.rows[0].trip_id]
        );

        return res.status(201).json({ success: true, data: mapTripForUi(enriched.rows[0] || result.rows[0]) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/trips', async (req, res) => {
    const { status, driver_id, driver } = req.query;

    try {
        const params = [];
        const where = [];

        if (status) {
            params.push(buildStatusFilter(status));
            where.push(`LOWER(t.status) = ANY($${params.length})`);
        }

        const effectiveDriverId = driver_id || driver;
        if (effectiveDriverId !== undefined) {
            const parsedDriverId = Number(effectiveDriverId);
            if (!Number.isFinite(parsedDriverId)) {
                return res.status(400).json({ success: false, message: 'Invalid driver_id value' });
            }

            params.push(parsedDriverId);
            where.push(`t.driver_id = $${params.length}`);
        }

        const query = `
            SELECT
                t.*,
                tr.truck_number,
                d.name AS driver_name,
                COALESCE(t.distance_km, t.trip_distance, COALESCE(t.empty_km, 0) + COALESCE(t.loaded_km, 0), 0) AS distance_km
            FROM trips t
            LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
            LEFT JOIN drivers d ON d.driver_id = t.driver_id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY t.created_at DESC
        `;

        const result = await pool.query(query, params);
        return res.json({
            success: true,
            count: result.rows.length,
            data: result.rows.map(mapTripForUi)
        });
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

        return res.json({ success: true, data: mapTripForUi(result.rows[0]) });
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

    const normalizedStatus = normalizeStatusForStorage(status);
    if (!normalizedStatus || !ALLOWED_STATUS.has(normalizedStatus)) {
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

        return res.json({ success: true, data: mapTripForUi(result.rows[0]) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Compatibility endpoint for legacy driver dashboard actions.
app.post('/trips/:id/start', async (req, res) => {
    const tripId = Number(req.params.id);
    if (!Number.isFinite(tripId)) {
        return res.status(400).json({ success: false, message: 'Invalid trip id' });
    }

    try {
        const existing = await pool.query('SELECT trip_id, status FROM trips WHERE trip_id = $1', [tripId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        if (!isPlannedStatus(existing.rows[0].status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot start trip with status '${mapStatusForUi(existing.rows[0].status)}'`
            });
        }

        const updated = await updateTripStatusWithFallback(
            tripId,
            ['in_progress', 'running', 'Running'],
            'start_time = COALESCE(start_time, NOW())'
        );

        if (updated) {
            await Promise.all([
                setTruckStatus(updated.truck_id, 'assigned'),
                setDriverAssignment(updated.driver_id, 'assigned', updated.truck_id)
            ]);
        }

        return res.json({
            success: true,
            message: 'Trip started successfully',
            data: mapTripForUi(updated)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Compatibility endpoint for legacy driver dashboard actions.
app.post('/trips/:id/end', async (req, res) => {
    const tripId = Number(req.params.id);
    if (!Number.isFinite(tripId)) {
        return res.status(400).json({ success: false, message: 'Invalid trip id' });
    }

    try {
        const existing = await pool.query('SELECT trip_id, status FROM trips WHERE trip_id = $1', [tripId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        if (!isRunningStatus(existing.rows[0].status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot complete trip with status '${mapStatusForUi(existing.rows[0].status)}'`
            });
        }

        const updated = await updateTripStatusWithFallback(
            tripId,
            ['completed', 'Completed'],
            'end_time = COALESCE(end_time, NOW())'
        );

        if (updated) {
            await Promise.all([
                setTruckStatus(updated.truck_id, 'available'),
                setDriverAssignment(updated.driver_id, 'available', null)
            ]);
        }

        return res.json({
            success: true,
            message: 'Trip completed successfully',
            data: mapTripForUi(updated)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/trips/:id/cancel', async (req, res) => {
    const tripId = Number(req.params.id);
    if (!Number.isFinite(tripId)) {
        return res.status(400).json({ success: false, message: 'Invalid trip id' });
    }

    try {
        const existing = await pool.query('SELECT trip_id, status FROM trips WHERE trip_id = $1', [tripId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        if (!isPlannedStatus(existing.rows[0].status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel trip with status '${mapStatusForUi(existing.rows[0].status)}'`
            });
        }

        const updated = await updateTripStatusWithFallback(tripId, ['cancelled', 'Canceled', 'Cancelled']);

        if (updated) {
            await Promise.all([
                setTruckStatus(updated.truck_id, 'available'),
                setDriverAssignment(updated.driver_id, 'available', null)
            ]);
        }

        return res.json({
            success: true,
            message: 'Trip cancelled successfully',
            data: mapTripForUi(updated)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/trips/driver/:driverId', async (req, res) => {
    const driverId = Number(req.params.driverId);
    if (!Number.isFinite(driverId)) {
        return res.status(400).json({ success: false, message: 'Invalid driver id' });
    }

    try {
        const result = await pool.query(
            `SELECT
                t.*,
                tr.truck_number,
                d.name AS driver_name,
                COALESCE(t.distance_km, t.trip_distance, COALESCE(t.empty_km, 0) + COALESCE(t.loaded_km, 0), 0) AS distance_km
             FROM trips t
             LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
             LEFT JOIN drivers d ON d.driver_id = t.driver_id
             WHERE t.driver_id = $1
             ORDER BY t.created_at DESC`,
            [driverId]
        );

        return res.json({
            success: true,
            count: result.rows.length,
            data: result.rows.map(mapTripForUi)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/trips/driver/:driverId/history', async (req, res) => {
    const driverId = Number(req.params.driverId);
    if (!Number.isFinite(driverId)) {
        return res.status(400).json({ success: false, message: 'Invalid driver id' });
    }

    try {
        const [tripsResult, statsResult] = await Promise.all([
            pool.query(
                `SELECT t.*, tr.truck_number
                 FROM trips t
                 LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
                 WHERE t.driver_id = $1
                 ORDER BY t.created_at DESC`,
                [driverId]
            ),
            pool.query(
                `SELECT
                    COUNT(*) AS total_trips,
                    COUNT(*) FILTER (WHERE LOWER(status) = 'completed') AS completed_trips,
                    COALESCE(SUM(CASE WHEN LOWER(status) = 'completed' THEN COALESCE(trip_distance, 0) ELSE 0 END), 0) AS total_distance,
                    0::NUMERIC AS total_revenue
                 FROM trips
                 WHERE driver_id = $1`,
                [driverId]
            )
        ]);

        return res.json({
            success: true,
            data: {
                trips: tripsResult.rows.map(mapTripForUi),
                statistics: statsResult.rows[0] || {
                    total_trips: 0,
                    completed_trips: 0,
                    total_distance: 0,
                    total_revenue: 0
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ========== TRIP ANALYTICS SUMMARY ==========

app.get('/trips/analytics/summary', async (req, res) => {
    try {
        // Trip counts by status
        const tripCountsResult = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE true) AS total,
                COUNT(*) FILTER (WHERE LOWER(status) = 'planned') AS planned,
                COUNT(*) FILTER (WHERE LOWER(status) IN ('in_progress', 'running')) AS running,
                COUNT(*) FILTER (WHERE LOWER(status) = 'completed') AS completed,
                COUNT(*) FILTER (WHERE LOWER(status) IN ('cancelled', 'canceled')) AS cancelled
            FROM trips
        `);
        const trip_counts = tripCountsResult.rows[0] || {};

        // Truck status counts
        const truckStatusResult = await pool.query(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE LOWER(status) = 'available') AS "Available",
                COUNT(*) FILTER (WHERE LOWER(status) = 'assigned') AS "Assigned",
                COUNT(*) FILTER (WHERE LOWER(status) = 'maintenance') AS "Maintenance"
            FROM trucks
        `);
        const truck_status = truckStatusResult.rows[0] || {};

        // Invoice counts
        const invoiceCountsResult = await pool.query(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE payment_status = 'Pending') AS pending,
                COUNT(*) FILTER (WHERE payment_status = 'Partial') AS partial,
                COUNT(*) FILTER (WHERE payment_status = 'Paid') AS paid
            FROM invoices
        `);
        const invoice_counts = invoiceCountsResult.rows[0] || {};

        // Revenue & outstanding
        const revenueResult = await pool.query(`
            SELECT
                COALESCE(SUM(amount_paid), 0) AS total_revenue,
                COALESCE(SUM(total_amount), 0) AS total_invoiced,
                COALESCE(SUM(total_amount) - SUM(amount_paid), 0) AS total_outstanding
            FROM invoices
        `);
        const revenueRow = revenueResult.rows[0] || {};

        // Expenses
        const expenseResult = await pool.query(`
            SELECT COALESCE(SUM(amount), 0) AS total_expenses
            FROM expenses
        `);
        const total_expenses = Number(expenseResult.rows[0]?.total_expenses || 0);
        const total_revenue = Number(revenueRow.total_revenue || 0);
        const net_profit = total_revenue - total_expenses;

        // Monthly trips breakdown (last 6 months)
        const monthlyTripsResult = await pool.query(`
            SELECT
                TO_CHAR(created_at, 'YYYY-MM') AS month,
                TO_CHAR(created_at, 'Mon YYYY') AS month_label,
                COUNT(*) FILTER (WHERE LOWER(status) = 'completed') AS completed,
                COUNT(*) AS total,
                COALESCE(SUM(trip_distance), 0) AS total_distance,
                0 AS revenue
            FROM trips
            WHERE created_at >= NOW() - INTERVAL '6 months'
            GROUP BY month, month_label
            ORDER BY month ASC
        `);

        // Update monthly revenue from invoices
        const monthlyInvoiceResult = await pool.query(`
            SELECT
                TO_CHAR(i.invoice_date, 'YYYY-MM') AS month,
                COALESCE(SUM(i.amount_paid), 0) AS revenue
            FROM invoices i
            WHERE i.invoice_date >= NOW() - INTERVAL '6 months'
            GROUP BY month
        `);
        const invoiceRevenueMap = {};
        for (const row of monthlyInvoiceResult.rows) {
            invoiceRevenueMap[row.month] = Number(row.revenue);
        }

        const monthly_trips = (monthlyTripsResult.rows || []).map(row => ({
            ...row,
            revenue: invoiceRevenueMap[row.month] || 0
        }));

        // Monthly expenses
        const monthlyExpensesResult = await pool.query(`
            SELECT
                TO_CHAR(created_at, 'YYYY-MM') AS month,
                COALESCE(SUM(amount), 0) AS total
            FROM expenses
            WHERE created_at >= NOW() - INTERVAL '6 months'
            GROUP BY month
            ORDER BY month ASC
        `);

        const tripColumns = await getTableColumns('trips');
        const distanceColumn = tripColumns.has('distance_km') ? 'distance_km' : 'trip_distance';
        const distanceExpr = `COALESCE(${distanceColumn}, 0)`;
        const hasBaseFreight = tripColumns.has('base_freight');
        const hasDeadMileage = tripColumns.has('empty_km') && tripColumns.has('loaded_km');

        const avgFreightExpr = hasBaseFreight
            ? `COALESCE(AVG(CASE WHEN LOWER(status) = 'completed' THEN COALESCE(base_freight, 0) END), 0)`
            : '0';

        const avgDeadMileageExpr = hasDeadMileage
            ? `COALESCE(AVG(
                CASE
                    WHEN LOWER(status) = 'completed' AND (COALESCE(empty_km, 0) + COALESCE(loaded_km, 0)) > 0
                    THEN (COALESCE(empty_km, 0) / (COALESCE(empty_km, 0) + COALESCE(loaded_km, 0))) * 100
                    ELSE NULL
                END
            ), 0)`
            : '0';

        const tripMetricsResult = await pool.query(`
            SELECT
                COALESCE(SUM(CASE WHEN LOWER(status) = 'completed' THEN ${distanceExpr} ELSE 0 END), 0) AS total_distance,
                ${avgFreightExpr} AS avg_freight,
                ${avgDeadMileageExpr} AS average_dead_mileage_percent
            FROM trips
        `);

        const topRoutesRevenueExpr = hasBaseFreight
            ? `COALESCE(SUM(CASE WHEN LOWER(status) = 'completed' THEN COALESCE(base_freight, 0) ELSE 0 END), 0)`
            : '0';

        const topRoutesResult = await pool.query(`
            SELECT
                source,
                destination,
                COUNT(*) AS trip_count,
                ${topRoutesRevenueExpr} AS total_revenue,
                COALESCE(AVG(CASE WHEN LOWER(status) = 'completed' THEN ${distanceExpr} END), 0) AS avg_distance
            FROM trips
            GROUP BY source, destination
            ORDER BY trip_count DESC
            LIMIT 5
        `);

        const tripMetrics = tripMetricsResult.rows[0] || {};

        return res.json({
            success: true,
            data: {
                trip_counts,
                truck_status,
                invoice_counts,
                total_revenue,
                total_invoiced: Number(revenueRow.total_invoiced || 0),
                total_outstanding: Number(revenueRow.total_outstanding || 0),
                total_expenses,
                net_profit,
                total_distance: Number(tripMetrics.total_distance || 0),
                avg_freight: Number(tripMetrics.avg_freight || 0),
                average_dead_mileage_percent: Number(tripMetrics.average_dead_mileage_percent || 0),
                monthly_trips,
                monthly_expenses: monthlyExpensesResult.rows || [],
                top_routes: topRoutesResult.rows || []
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ========== EXPENSES ==========

app.get('/expenses', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.*, t.lr_number, t.source, t.destination
            FROM expenses e
            LEFT JOIN trips t ON t.trip_id = e.trip_id
            ORDER BY e.created_at DESC
        `);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/expenses', async (req, res) => {
    const { trip_id = null, truck_id = null, category, amount, description = '' } = req.body;

    if (!category || amount === undefined) {
        return res.status(400).json({ success: false, message: 'category and amount are required' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO expenses (trip_id, truck_id, category, amount, description)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                trip_id !== null ? Number(trip_id) : null,
                truck_id !== null ? Number(truck_id) : null,
                category,
                Number(amount),
                description
            ]
        );

        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/expenses/:id', async (req, res) => {
    const expenseId = String(req.params.id || '').trim();
    if (!expenseId) {
        return res.status(400).json({ success: false, message: 'Invalid expense id' });
    }

    try {
        const result = await pool.query(
            `DELETE FROM expenses WHERE expense_id::text = $1 RETURNING expense_id`,
            [expenseId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Expense not found' });
        }

        return res.json({ success: true, message: 'Expense deleted successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ========== INVOICES ==========

app.get('/invoices', async (req, res) => {
    const { status } = req.query;

    try {
        const params = [];
        const where = [];

        if (status) {
            params.push(String(status));
            where.push(`payment_status = $${params.length}`);
        }

        const result = await pool.query(`
            SELECT i.*, t.lr_number, t.source, t.destination
            FROM invoices i
            LEFT JOIN trips t ON t.trip_id = i.trip_id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY i.created_at DESC
        `, params);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/invoices', async (req, res) => {
    const {
        trip_id,
        invoice_number,
        invoice_date,
        due_date,
        subtotal,
        gst_amount,
        total_amount,
        payment_status = 'Pending',
        amount_paid = 0
    } = req.body;

    try {
        const parsedTripId = trip_id !== null && trip_id !== undefined ? Number(trip_id) : null;
        if (parsedTripId !== null && !Number.isFinite(parsedTripId)) {
            return res.status(400).json({ success: false, message: 'Invalid trip_id' });
        }

        let resolvedInvoiceNumber = invoice_number;
        let resolvedInvoiceDate = invoice_date;
        let resolvedDueDate = due_date;
        let resolvedSubtotal = subtotal;
        let resolvedGstAmount = gst_amount;
        let resolvedTotalAmount = total_amount;

        if (
            !resolvedInvoiceNumber || !resolvedInvoiceDate || !resolvedDueDate ||
            resolvedSubtotal === undefined || resolvedGstAmount === undefined || resolvedTotalAmount === undefined
        ) {
            if (parsedTripId === null) {
                return res.status(400).json({ success: false, message: 'trip_id is required for auto invoice generation' });
            }

            const tripResult = await pool.query(
                `SELECT trip_id, base_freight, toll_amount, loading_cost, unloading_cost, fast_tag, gst_percentage
                 FROM trips
                 WHERE trip_id = $1`,
                [parsedTripId]
            );

            if (tripResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Trip not found for invoice generation' });
            }

            const existingInvoice = await pool.query(
                `SELECT invoice_id, invoice_number
                 FROM invoices
                 WHERE trip_id = $1
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [parsedTripId]
            );

            if (existingInvoice.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `Invoice already exists for this trip (${existingInvoice.rows[0].invoice_number})`
                });
            }

            const trip = tripResult.rows[0];
            const generatedSubtotal =
                Number(trip.base_freight || 0) +
                Number(trip.toll_amount || 0) +
                Number(trip.loading_cost || 0) +
                Number(trip.unloading_cost || 0) +
                Number(trip.fast_tag || 0);
            const gstPct = Number(trip.gst_percentage || 0);
            const generatedGst = Number(((generatedSubtotal * gstPct) / 100).toFixed(2));
            const generatedTotal = Number((generatedSubtotal + generatedGst).toFixed(2));

            const today = new Date();
            const todayIso = today.toISOString().slice(0, 10);
            const dueDateIso = resolvedDueDate || new Date(today.getTime() + (15 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
            const stamp = todayIso.replace(/-/g, '');
            resolvedInvoiceNumber = resolvedInvoiceNumber || `INV-${stamp}-${parsedTripId}-${Math.floor(100 + (Math.random() * 900))}`;
            resolvedInvoiceDate = resolvedInvoiceDate || todayIso;
            resolvedDueDate = dueDateIso;
            resolvedSubtotal = resolvedSubtotal !== undefined ? resolvedSubtotal : generatedSubtotal;
            resolvedGstAmount = resolvedGstAmount !== undefined ? resolvedGstAmount : generatedGst;
            resolvedTotalAmount = resolvedTotalAmount !== undefined ? resolvedTotalAmount : generatedTotal;
        }

        const paidAmount = Number(amount_paid || 0);
        const finalTotal = Number(resolvedTotalAmount);
        const normalizedPaymentStatus = paidAmount <= 0
            ? 'Pending'
            : paidAmount >= finalTotal
                ? 'Paid'
                : 'Partial';

        const result = await pool.query(
            `INSERT INTO invoices (trip_id, invoice_number, invoice_date, due_date, subtotal, gst_amount, total_amount, payment_status, amount_paid)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                parsedTripId,
                resolvedInvoiceNumber,
                resolvedInvoiceDate,
                resolvedDueDate,
                Number(resolvedSubtotal),
                Number(resolvedGstAmount),
                finalTotal,
                payment_status && ['Pending', 'Partial', 'Paid'].includes(payment_status)
                    ? payment_status
                    : normalizedPaymentStatus,
                paidAmount
            ]
        );

        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/invoices/:id/payment', async (req, res) => {
    const invoiceId = String(req.params.id || '').trim();
    const paymentAmount = Number(req.body?.amount || 0);

    if (!invoiceId) {
        return res.status(400).json({ success: false, message: 'Invalid invoice id' });
    }

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });
    }

    try {
        const invoiceResult = await pool.query(
            `SELECT * FROM invoices WHERE invoice_id::text = $1`,
            [invoiceId]
        );

        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        const invoice = invoiceResult.rows[0];
        const currentPaid = Number(invoice.amount_paid || 0);
        const totalAmountValue = Number(invoice.total_amount || 0);
        const nextPaid = Number(Math.min(totalAmountValue, currentPaid + paymentAmount).toFixed(2));
        const nextStatus = nextPaid <= 0
            ? 'Pending'
            : nextPaid >= totalAmountValue
                ? 'Paid'
                : 'Partial';

        const updated = await pool.query(
            `UPDATE invoices
             SET amount_paid = $1,
                 payment_status = $2
             WHERE invoice_id::text = $3
             RETURNING *`,
            [nextPaid, nextStatus, invoiceId]
        );

        return res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ========== FUEL LOGS ==========

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

        const result = await pool.query(
            `SELECT
                f.fuel_id,
                f.trip_id,
                COALESCE(f.truck_id, trp.truck_id) AS truck_id,
                COALESCE(t.truck_number, trk.truck_number) AS truck_number,
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
             LEFT JOIN trucks trk ON trk.truck_id = trp.truck_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY COALESCE(f.timestamp, f.created_at) DESC`,
            params
        );
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
