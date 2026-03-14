require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3102;

app.use(cors());
app.use(express.json());

function plusOneYearIsoDate() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
}

function parseSmartFleetCommand(command) {
    const normalized = String(command || '').trim();

    const fullPattern = /add\s+truck\s+([a-z0-9-]+)\s+capacity\s+([0-9]+(?:\.[0-9]+)?)\s+tons?\s+driver\s+([a-z][a-z\s.'-]+)/i;
    const truckOnlyPattern = /add\s+truck\s+([a-z0-9-]+)\s+capacity\s+([0-9]+(?:\.[0-9]+)?)\s+tons?/i;
    const driverOnlyPattern = /add\s+driver\s+([a-z][a-z\s.'-]+)/i;

    let matched = normalized.match(fullPattern);
    if (matched) {
        return {
            action: 'add_truck_driver',
            truck_number: matched[1].toUpperCase(),
            capacity: Number(matched[2]),
            driver_name: matched[3].trim().replace(/\s+/g, ' ')
        };
    }

    matched = normalized.match(truckOnlyPattern);
    if (matched) {
        return {
            action: 'add_truck',
            truck_number: matched[1].toUpperCase(),
            capacity: Number(matched[2])
        };
    }

    matched = normalized.match(driverOnlyPattern);
    if (matched) {
        return {
            action: 'add_driver',
            driver_name: matched[1].trim().replace(/\s+/g, ' ')
        };
    }

    return null;
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS trucks (
            truck_id SERIAL PRIMARY KEY,
            truck_number VARCHAR(50) UNIQUE NOT NULL,
            capacity DECIMAL(10,2) NOT NULL,
            mileage_kmpl NUMERIC(10,2) DEFAULT 4.50,
            status VARCHAR(20) DEFAULT 'Available' CHECK(status IN ('Available', 'Assigned', 'Maintenance')),
            insurance_expiry DATE NOT NULL,
            fitness_expiry DATE NOT NULL,
            deleted_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS drivers (
            driver_id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            license_number VARCHAR(50) UNIQUE NOT NULL,
            license_expiry DATE NOT NULL,
            status VARCHAR(20) DEFAULT 'Available' CHECK(status IN ('Available', 'Assigned')),
            assigned_truck_id INTEGER NULL REFERENCES trucks(truck_id) ON DELETE SET NULL,
            deleted_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('ALTER TABLE trucks ADD COLUMN IF NOT EXISTS mileage_kmpl NUMERIC(10,2) DEFAULT 4.50');
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', service: 'fleet-service', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.get('/fleet/trucks', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM trucks WHERE deleted_at IS NULL ORDER BY created_at DESC');
        res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/fleet/trucks', async (req, res) => {
    const {
        truck_number,
        capacity,
        mileage_kmpl = 4.5,
        insurance_expiry = plusOneYearIsoDate(),
        fitness_expiry = plusOneYearIsoDate()
    } = req.body;

    if (!truck_number || !capacity) {
        return res.status(400).json({ success: false, message: 'truck_number and capacity are required' });
    }

    try {
        const inserted = await pool.query(
            `INSERT INTO trucks (truck_number, capacity, mileage_kmpl, insurance_expiry, fitness_expiry)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [String(truck_number).toUpperCase(), Number(capacity), Number(mileage_kmpl), insurance_expiry, fitness_expiry]
        );

        res.status(201).json({ success: true, data: inserted.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/fleet/drivers', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT d.*, t.truck_number
             FROM drivers d
             LEFT JOIN trucks t ON d.assigned_truck_id = t.truck_id
             WHERE d.deleted_at IS NULL
             ORDER BY d.created_at DESC`
        );

        res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/fleet/drivers', async (req, res) => {
    const {
        name,
        phone = '0000000000',
        license_number,
        license_expiry = plusOneYearIsoDate()
    } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: 'name is required' });
    }

    const resolvedLicense = license_number || `LIC-${Date.now()}`;

    try {
        const inserted = await pool.query(
            `INSERT INTO drivers (name, phone, license_number, license_expiry)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [name, phone, resolvedLicense, license_expiry]
        );

        res.status(201).json({ success: true, data: inserted.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/fleet/assign', async (req, res) => {
    const { truck_id, driver_id } = req.body;
    if (!truck_id || !driver_id) {
        return res.status(400).json({ success: false, message: 'truck_id and driver_id are required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE drivers SET assigned_truck_id = $1, status = 'Assigned' WHERE driver_id = $2`,
            [truck_id, driver_id]
        );

        await client.query(
            `UPDATE trucks SET status = 'Assigned' WHERE truck_id = $1`,
            [truck_id]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Truck assigned to driver' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
});

app.post('/fleet/smart-entry', async (req, res) => {
    const { command } = req.body;
    if (!command) {
        return res.status(400).json({ success: false, message: 'command is required' });
    }

    const parsed = parseSmartFleetCommand(command);
    if (!parsed) {
        return res.status(400).json({
            success: false,
            message: 'Could not parse command. Example: Add truck TN10AB1000 capacity 12 tons driver Ravi'
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let createdTruck = null;
        let createdDriver = null;

        if (parsed.action === 'add_truck' || parsed.action === 'add_truck_driver') {
            const truckInsert = await client.query(
                `INSERT INTO trucks (truck_number, capacity, insurance_expiry, fitness_expiry, mileage_kmpl)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [parsed.truck_number, parsed.capacity, plusOneYearIsoDate(), plusOneYearIsoDate(), 4.5]
            );
            createdTruck = truckInsert.rows[0];
        }

        if (parsed.action === 'add_driver' || parsed.action === 'add_truck_driver') {
            const generatedPhone = `9${String(Date.now()).slice(-9)}`;
            const generatedLicense = `LIC-${Date.now()}`;

            const driverInsert = await client.query(
                `INSERT INTO drivers (name, phone, license_number, license_expiry, assigned_truck_id, status)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [
                    parsed.driver_name,
                    generatedPhone,
                    generatedLicense,
                    plusOneYearIsoDate(),
                    createdTruck ? createdTruck.truck_id : null,
                    createdTruck ? 'Assigned' : 'Available'
                ]
            );
            createdDriver = driverInsert.rows[0];
        }

        if (createdTruck && createdDriver) {
            await client.query(`UPDATE trucks SET status = 'Assigned' WHERE truck_id = $1`, [createdTruck.truck_id]);
        }

        await client.query('COMMIT');

        return res.status(201).json({
            success: true,
            parsed,
            data: {
                truck: createdTruck,
                driver: createdDriver
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
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
