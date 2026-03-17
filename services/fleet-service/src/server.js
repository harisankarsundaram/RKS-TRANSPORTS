require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3202);

app.use(cors());
app.use(express.json());

async function getTableColumns(tableName) {
    const result = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
    );

    return new Set(result.rows.map((row) => row.column_name));
}

async function getDriverByUserId(userId) {
    const numericUserId = Number(userId);
    if (!Number.isFinite(numericUserId)) {
        return null;
    }

    const [driverColumns, truckColumns] = await Promise.all([
        getTableColumns('drivers'),
        getTableColumns('trucks')
    ]);

    if (driverColumns.size === 0) {
        return null;
    }

    const truckJoinClause = driverColumns.has('assigned_truck_id')
        ? 'LEFT JOIN trucks t ON t.truck_id = d.assigned_truck_id'
        : driverColumns.has('truck_id')
            ? 'LEFT JOIN trucks t ON t.truck_id = d.truck_id'
            : 'LEFT JOIN trucks t ON 1 = 0';

    const truckCapacityColumn = truckColumns.has('capacity_tons')
        ? 't.capacity_tons'
        : truckColumns.has('capacity')
            ? 't.capacity'
            : 'NULL';

    const userJoinClause = driverColumns.has('user_id')
        ? ''
        : 'LEFT JOIN users u ON u.phone = d.phone';

    const userWhereClause = driverColumns.has('user_id')
        ? 'd.user_id = $1'
        : 'u.user_id = $1';

    const result = await pool.query(
        `SELECT d.*, t.truck_number, ${truckCapacityColumn} AS truck_capacity
         FROM drivers d
         ${userJoinClause}
         ${truckJoinClause}
         WHERE ${userWhereClause} AND d.deleted_at IS NULL
         ORDER BY d.created_at DESC
         LIMIT 1`,
        [numericUserId]
    );

    return mapDriverRow(result.rows[0] || null);
}

function normalizeTruckStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === 'available') {
        return 'available';
    }

    if (normalized === 'assigned') {
        return 'assigned';
    }

    if (normalized === 'maintenance') {
        return 'maintenance';
    }

    return null;
}

function normalizeDriverStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === 'available') {
        return 'available';
    }

    if (normalized === 'assigned') {
        return 'assigned';
    }

    if (normalized === 'inactive') {
        return 'inactive';
    }

    return null;
}

function mapStatusForUi(status) {
    const normalized = String(status || '').toLowerCase();

    if (normalized === 'available') {
        return 'Available';
    }

    if (normalized === 'assigned') {
        return 'Assigned';
    }

    if (normalized === 'maintenance') {
        return 'Maintenance';
    }

    if (normalized === 'inactive') {
        return 'Inactive';
    }

    return status;
}

function parseOptionalDate(value) {
    if (!value) {
        return null;
    }

    const dateValue = new Date(value);
    if (Number.isNaN(dateValue.getTime())) {
        return null;
    }

    return value;
}

function mapTruckRow(row) {
    if (!row) {
        return row;
    }

    const capacity = Number(row.capacity ?? row.capacity_tons ?? 0);
    return {
        ...row,
        status: mapStatusForUi(row.status),
        capacity,
        capacity_tons: Number(row.capacity_tons ?? capacity)
    };
}

function mapDriverRow(row) {
    if (!row) {
        return row;
    }

    return {
        ...row,
        status: mapStatusForUi(row.status)
    };
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS trucks (
            truck_id SERIAL PRIMARY KEY,
            truck_number VARCHAR(50) UNIQUE NOT NULL,
            capacity_tons NUMERIC(10,2) NOT NULL,
            mileage_kmpl NUMERIC(10,2) NOT NULL DEFAULT 4.5,
            status VARCHAR(20) NOT NULL CHECK(status IN ('available', 'assigned', 'maintenance')),
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('ALTER TABLE trucks ADD COLUMN IF NOT EXISTS capacity NUMERIC(10,2)');
    await pool.query('ALTER TABLE trucks ADD COLUMN IF NOT EXISTS insurance_expiry DATE');
    await pool.query('ALTER TABLE trucks ADD COLUMN IF NOT EXISTS fitness_expiry DATE');
    await pool.query('ALTER TABLE trucks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL');
    await pool.query(`
        UPDATE trucks
        SET
            capacity = COALESCE(capacity, capacity_tons, 0),
            capacity_tons = COALESCE(capacity_tons, capacity, 0),
            insurance_expiry = COALESCE(insurance_expiry, (CURRENT_DATE + INTERVAL '365 days')::date),
            fitness_expiry = COALESCE(fitness_expiry, (CURRENT_DATE + INTERVAL '180 days')::date)
    `);
    await pool.query(`
        DO $$
        BEGIN
            ALTER TABLE trucks DROP CONSTRAINT IF EXISTS trucks_status_check;
            ALTER TABLE trucks ADD CONSTRAINT trucks_status_check CHECK (LOWER(status) IN ('available', 'assigned', 'maintenance'));
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END $$;
    `);
    await pool.query("UPDATE trucks SET status = LOWER(COALESCE(status, 'available'))");

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

    await pool.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS user_id INTEGER UNIQUE');
    await pool.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_expiry DATE');
    await pool.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS assigned_truck_id INTEGER');
    await pool.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL');
    await pool.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'truck_id'
            ) THEN
                EXECUTE 'UPDATE drivers SET assigned_truck_id = COALESCE(assigned_truck_id, truck_id)';
            END IF;
        END $$;
    `);
    await pool.query(`
        UPDATE drivers
        SET
            license_expiry = COALESCE(license_expiry, (CURRENT_DATE + INTERVAL '730 days')::date)
    `);
    await pool.query(`
        DO $$
        BEGIN
            ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_status_check;
            ALTER TABLE drivers ADD CONSTRAINT drivers_status_check CHECK (LOWER(status) IN ('available', 'assigned', 'inactive'));
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END $$;
    `);
    await pool.query("UPDATE drivers SET status = LOWER(COALESCE(status, 'available'))");

    await pool.query(`
        CREATE TABLE IF NOT EXISTS maintenance (
            maintenance_id SERIAL PRIMARY KEY,
            truck_id INTEGER REFERENCES trucks(truck_id),
            service_date DATE NOT NULL,
            description TEXT,
            cost NUMERIC(12,2) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_trucks_status_phase1 ON trucks(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_drivers_status_phase1 ON drivers(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_trucks_deleted_at_phase1 ON trucks(deleted_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_drivers_deleted_at_phase1 ON drivers(deleted_at)');
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({ status: 'OK', service: 'fleet-service', timestamp: new Date().toISOString() });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

// ========== TRUCKS ==========

app.post('/trucks', async (req, res) => {
    const {
        truck_number,
        capacity_tons,
        capacity,
        mileage_kmpl = 4.5,
        status = 'available',
        insurance_expiry,
        fitness_expiry
    } = req.body;

    const effectiveCapacity = capacity_tons ?? capacity;
    if (!truck_number || effectiveCapacity === undefined) {
        return res.status(400).json({ success: false, message: 'truck_number and capacity/capacity_tons are required' });
    }

    const normalizedStatus = normalizeTruckStatus(status);
    if (!normalizedStatus) {
        return res.status(400).json({ success: false, message: 'Invalid truck status' });
    }

    try {
        const resolvedInsurance = parseOptionalDate(insurance_expiry) || new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
        const resolvedFitness = parseOptionalDate(fitness_expiry) || new Date(Date.now() + (180 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);

        const result = await pool.query(
            `INSERT INTO trucks (truck_number, capacity, capacity_tons, mileage_kmpl, status, insurance_expiry, fitness_expiry)
             VALUES ($1, $2, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                String(truck_number).toUpperCase(),
                Number(effectiveCapacity),
                Number(mileage_kmpl),
                normalizedStatus,
                resolvedInsurance,
                resolvedFitness
            ]
        );

        return res.status(201).json({ success: true, data: mapTruckRow(result.rows[0]) });
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
            const normalizedStatus = normalizeTruckStatus(status);
            if (!normalizedStatus) {
                return res.status(400).json({ success: false, message: 'Invalid truck status' });
            }

            params.push(normalizedStatus);
            where.push(`LOWER(status) = $${params.length}`);
        }

        where.push('deleted_at IS NULL');

        const query = `
            SELECT
                truck_id,
                truck_number,
                capacity,
                capacity_tons,
                mileage_kmpl,
                status,
                insurance_expiry,
                fitness_expiry,
                created_at
            FROM trucks
            WHERE ${where.join(' AND ')}
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, params);
        return res.json({
            success: true,
            count: result.rows.length,
            data: result.rows.map(mapTruckRow)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/trucks/:id', async (req, res) => {
    const truckId = Number(req.params.id);
    if (!Number.isFinite(truckId)) {
        return res.status(400).json({ success: false, message: 'Invalid truck id' });
    }

    try {
        let hasActiveTrip = false;

        try {
            const activeTrip = await pool.query(
                `SELECT trip_id
                 FROM trips
                 WHERE truck_id = $1 AND LOWER(status) IN ('planned', 'running', 'in_progress')
                 LIMIT 1`,
                [truckId]
            );
            hasActiveTrip = activeTrip.rows.length > 0;
        } catch (tripError) {
            if (tripError.code !== '42P01') {
                throw tripError;
            }
        }

        if (hasActiveTrip) {
            return res.status(400).json({ success: false, message: 'Cannot delete truck with active trips' });
        }

        await pool.query(
            `UPDATE drivers
             SET assigned_truck_id = NULL,
                 status = CASE WHEN LOWER(status) = 'assigned' THEN 'available' ELSE status END
             WHERE assigned_truck_id = $1`,
            [truckId]
        );

        const result = await pool.query(
            `UPDATE trucks
             SET deleted_at = NOW()
             WHERE truck_id = $1 AND deleted_at IS NULL
             RETURNING truck_id`,
            [truckId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Truck not found' });
        }

        return res.json({ success: true, message: 'Truck deleted successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ========== DRIVERS ==========

app.post('/drivers', async (req, res) => {
    const {
        name,
        phone,
        license_number,
        status = 'available',
        user_id = null,
        license_expiry = null,
        assigned_truck_id = null
    } = req.body;

    if (!name || !phone || !license_number) {
        return res.status(400).json({ success: false, message: 'name, phone and license_number are required' });
    }

    const normalizedStatus = normalizeDriverStatus(status);
    if (!normalizedStatus) {
        return res.status(400).json({ success: false, message: 'Invalid driver status' });
    }

    try {
        const resolvedLicenseExpiry = parseOptionalDate(license_expiry) || new Date(Date.now() + (730 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);

        const result = await pool.query(
            `INSERT INTO drivers (user_id, name, phone, license_number, license_expiry, status, assigned_truck_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                user_id !== null && user_id !== undefined ? Number(user_id) : null,
                name,
                phone,
                license_number,
                resolvedLicenseExpiry,
                normalizedStatus,
                assigned_truck_id !== null && assigned_truck_id !== undefined ? Number(assigned_truck_id) : null
            ]
        );

        if (assigned_truck_id !== null && assigned_truck_id !== undefined) {
            await pool.query(
                `UPDATE trucks SET status = 'assigned' WHERE truck_id = $1`,
                [Number(assigned_truck_id)]
            );
        }

        return res.status(201).json({ success: true, data: mapDriverRow(result.rows[0]) });
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
            const normalizedStatus = normalizeDriverStatus(status);
            if (!normalizedStatus) {
                return res.status(400).json({ success: false, message: 'Invalid driver status' });
            }

            params.push(normalizedStatus);
            where.push(`LOWER(d.status) = $${params.length}`);
        }

        where.push('d.deleted_at IS NULL');

        const query = `
            SELECT
                d.*,
                t.truck_number,
                COALESCE(t.capacity, t.capacity_tons, 0) AS truck_capacity
            FROM drivers d
            LEFT JOIN trucks t ON t.truck_id = d.assigned_truck_id
            WHERE ${where.join(' AND ')}
            ORDER BY d.created_at DESC
        `;

        const result = await pool.query(query, params);
        return res.json({
            success: true,
            count: result.rows.length,
            data: result.rows.map(mapDriverRow)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Compatibility endpoint for driver dashboards using auth user IDs.
app.get('/drivers/user/:userId', async (req, res) => {
    try {
        const profile = await getDriverByUserId(req.params.userId);
        if (!profile) {
            return res.status(404).json({ success: false, message: 'Driver profile not found' });
        }

        return res.json({ success: true, data: mapDriverRow(profile) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/drivers/:id', async (req, res) => {
    const driverId = Number(req.params.id);
    if (!Number.isFinite(driverId)) {
        return res.status(400).json({ success: false, message: 'Invalid driver id' });
    }

    try {
        const profileResult = await pool.query(
            `SELECT driver_id, assigned_truck_id
             FROM drivers
             WHERE driver_id = $1 AND deleted_at IS NULL`,
            [driverId]
        );

        if (profileResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        let hasActiveTrip = false;

        try {
            const activeTrip = await pool.query(
                `SELECT trip_id
                 FROM trips
                 WHERE driver_id = $1 AND LOWER(status) IN ('planned', 'running', 'in_progress')
                 LIMIT 1`,
                [driverId]
            );
            hasActiveTrip = activeTrip.rows.length > 0;
        } catch (tripError) {
            if (tripError.code !== '42P01') {
                throw tripError;
            }
        }

        if (hasActiveTrip) {
            return res.status(400).json({ success: false, message: 'Cannot delete driver with active trips' });
        }

        const assignedTruckId = profileResult.rows[0].assigned_truck_id;
        if (assignedTruckId) {
            await pool.query(
                `UPDATE trucks
                 SET status = CASE WHEN LOWER(status) = 'assigned' THEN 'available' ELSE status END
                 WHERE truck_id = $1`,
                [Number(assignedTruckId)]
            );
        }

        await pool.query(
            `UPDATE drivers
             SET assigned_truck_id = NULL,
                 deleted_at = NOW()
             WHERE driver_id = $1`,
            [driverId]
        );

        return res.json({ success: true, message: 'Driver deleted successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ========== MAINTENANCE ==========

app.get('/maintenance', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, t.truck_number
            FROM maintenance m
            LEFT JOIN trucks t ON t.truck_id = m.truck_id
            ORDER BY m.created_at DESC
        `);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/maintenance', async (req, res) => {
    const { truck_id, service_date, description = '', cost } = req.body;

    if (!truck_id || !service_date || cost === undefined) {
        return res.status(400).json({ success: false, message: 'truck_id, service_date and cost are required' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO maintenance (truck_id, service_date, description, cost)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [Number(truck_id), service_date, description, Number(cost)]
        );

        // Optionally mark truck as maintenance
        await pool.query(
            `UPDATE trucks SET status = 'maintenance' WHERE truck_id = $1`,
            [Number(truck_id)]
        );

        return res.status(201).json({ success: true, data: result.rows[0] });
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
