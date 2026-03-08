const pool = require('./db');

async function initDatabase() {
    let client = null;
    try {
        console.log('🔄 Initializing PostgreSQL Database...');
        client = await pool.connect();

        // Enable UUID extension (optional, for future use)
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL CHECK(role IN ('admin', 'driver', 'manager')),
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create trucks table
        await client.query(`
            CREATE TABLE IF NOT EXISTS trucks (
                truck_id SERIAL PRIMARY KEY,
                truck_number VARCHAR(50) UNIQUE NOT NULL,
                capacity DECIMAL(10,2) NOT NULL,
                status VARCHAR(20) DEFAULT 'Available' CHECK(status IN ('Available', 'Assigned', 'Maintenance')),
                insurance_expiry DATE NOT NULL,
                fitness_expiry DATE NOT NULL,
                deleted_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create drivers table
        await client.query(`
            CREATE TABLE IF NOT EXISTS drivers (
                driver_id SERIAL PRIMARY KEY,
                user_id INTEGER UNIQUE NULL,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                license_number VARCHAR(50) UNIQUE NOT NULL,
                license_expiry DATE NOT NULL,
                status VARCHAR(20) DEFAULT 'Available' CHECK(status IN ('Available', 'Assigned')),
                assigned_truck_id INTEGER NULL,
                deleted_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                FOREIGN KEY (assigned_truck_id) REFERENCES trucks(truck_id) ON DELETE SET NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
            )
        `);

        // Create trips table
        await client.query(`
            CREATE TABLE IF NOT EXISTS trips (
                trip_id SERIAL PRIMARY KEY,
                truck_id INTEGER NOT NULL,
                driver_id INTEGER NOT NULL,
                lr_number VARCHAR(50) UNIQUE NOT NULL,
                source VARCHAR(100) NOT NULL,
                destination VARCHAR(100) NOT NULL,
                distance_km DECIMAL(10,2) DEFAULT 0,
                freight_amount DECIMAL(10,2) DEFAULT 0,
                start_time TIMESTAMP,
                end_time TIMESTAMP,
                status VARCHAR(20) DEFAULT 'Planned' CHECK(status IN ('Planned', 'Running', 'Completed', 'Cancelled')),
                created_at TIMESTAMP DEFAULT NOW(),
                FOREIGN KEY (truck_id) REFERENCES trucks(truck_id),
                FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
            )
        `);

        // ── Financial Enhancement: ALTER trips table with new columns ──
        // 1️⃣ Rename freight_amount to base_freight if it exists
        await client.query(`
            DO $$ 
            BEGIN 
                -- Only rename if freight_amount exists AND base_freight DOES NOT exist
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='freight_amount') THEN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='base_freight') THEN
                        ALTER TABLE trips RENAME COLUMN freight_amount TO base_freight;
                    ELSE
                        -- If both exist, we just drop the old one to avoid confusion and clean up the schema
                        ALTER TABLE trips DROP COLUMN freight_amount;
                    END IF;
                END IF;
            END $$;
        `);

        const tripAlterColumns = [
            { name: 'base_freight', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'toll_amount', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'toll_billable', type: 'BOOLEAN DEFAULT false' },
            { name: 'loading_cost', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'loading_billable', type: 'BOOLEAN DEFAULT false' },
            { name: 'unloading_cost', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'unloading_billable', type: 'BOOLEAN DEFAULT false' },
            { name: 'other_charges', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'other_billable', type: 'BOOLEAN DEFAULT false' },
            { name: 'gst_percentage', type: 'NUMERIC(5,2) DEFAULT 0' },
            { name: 'driver_bata', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'empty_km', type: 'NUMERIC(10,2) DEFAULT 0' },
            { name: 'loaded_km', type: 'NUMERIC(10,2) DEFAULT 0' },
        ];

        for (const col of tripAlterColumns) {
            await client.query(`
                ALTER TABLE trips ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}
            `);
        }
        console.log('  ✔ trips table columns ensured (base_freight renamed)');

        // ... (gps_logs, fuel_logs, maintenance tables) ...

        // ── Financial Enhancement: Create expenses table (UUID) ──
        await client.query('DROP TABLE IF EXISTS expenses CASCADE');
        await client.query(`
            CREATE TABLE expenses (
                expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                trip_id INTEGER REFERENCES trips(trip_id) ON DELETE CASCADE,
                truck_id INTEGER REFERENCES trucks(truck_id),
                category VARCHAR(50) NOT NULL CHECK(category IN ('Fuel','Toll','Maintenance','Driver','RTO','Insurance','Misc')),
                amount NUMERIC(12,2) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('  ✔ expenses table created with UUID PK');

        // ── Financial Enhancement: Rebuild invoices table (UUID) ──
        await client.query('DROP TABLE IF EXISTS invoices CASCADE');
        await client.query(`
            CREATE TABLE invoices (
                invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                trip_id INTEGER UNIQUE REFERENCES trips(trip_id),
                invoice_number VARCHAR(50) UNIQUE NOT NULL,
                invoice_date DATE NOT NULL,
                due_date DATE NOT NULL,
                subtotal NUMERIC(12,2) NOT NULL,
                gst_amount NUMERIC(12,2) NOT NULL,
                total_amount NUMERIC(12,2) NOT NULL,
                payment_status VARCHAR(20) DEFAULT 'Pending' CHECK(payment_status IN ('Pending','Partial','Paid')),
                amount_paid NUMERIC(12,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('  ✔ invoices table created with UUID PK');

        // Create indexes for performance
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON drivers(user_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_trips_truck_id ON trips(truck_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips(driver_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_gps_logs_trip_id ON gps_logs(trip_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_fuel_logs_trip_id ON fuel_logs(trip_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_truck_id ON expenses(truck_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_invoices_trip_id ON invoices(trip_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status)');

        console.log('✅ PostgreSQL Database and tables initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        console.error('Full error:', error);
        return false;
    } finally {
        if (client) client.release();
    }
}

module.exports = initDatabase;
