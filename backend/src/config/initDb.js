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
            { name: 'gps_distance_km', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'base_freight', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'toll_amount', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'loading_cost', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'unloading_cost', type: 'NUMERIC(12,2) DEFAULT 0' },
            { name: 'fast_tag', type: 'NUMERIC(12,2) DEFAULT 0' },
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
        // Rename other_charges → fast_tag if needed
        await client.query(`
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='other_charges') THEN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='fast_tag') THEN
                        ALTER TABLE trips RENAME COLUMN other_charges TO fast_tag;
                    ELSE
                        ALTER TABLE trips DROP COLUMN other_charges;
                    END IF;
                END IF;
            END $$;
        `);

        // Drop deprecated billable columns
        const dropCols = ['toll_billable', 'loading_billable', 'unloading_billable', 'other_billable', 'fast_tag_billable'];
        for (const col of dropCols) {
            await client.query(`ALTER TABLE trips DROP COLUMN IF EXISTS ${col}`);
        }

        // Auto-sync distance_km = empty_km + loaded_km
        await client.query(`
            UPDATE trips SET distance_km = COALESCE(empty_km, 0) + COALESCE(loaded_km, 0)
            WHERE distance_km IS DISTINCT FROM (COALESCE(empty_km, 0) + COALESCE(loaded_km, 0))
        `);
        console.log('  ✔ trips table columns ensured (billable columns removed, other_charges→fast_tag)');

        // ... (gps_logs, fuel_logs, maintenance tables) ...

        // Create gps_logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS gps_logs (
                gps_id SERIAL PRIMARY KEY,
                truck_id INTEGER REFERENCES trucks(truck_id),
                trip_id INTEGER REFERENCES trips(trip_id) ON DELETE CASCADE,
                latitude DECIMAL(10,7) NOT NULL,
                longitude DECIMAL(10,7) NOT NULL,
                speed_kmph NUMERIC(10,2) DEFAULT 0,
                ignition BOOLEAN DEFAULT TRUE,
                recorded_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await client.query('ALTER TABLE gps_logs ADD COLUMN IF NOT EXISTS speed_kmph NUMERIC(10,2) DEFAULT 0');
        await client.query('ALTER TABLE gps_logs ADD COLUMN IF NOT EXISTS ignition BOOLEAN DEFAULT TRUE');

        // Create fuel_logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS fuel_logs (
                fuel_id SERIAL PRIMARY KEY,
                trip_id INTEGER REFERENCES trips(trip_id) ON DELETE CASCADE,
                liters DECIMAL(10,2) NOT NULL,
                price_per_liter DECIMAL(10,2) NOT NULL,
                total_cost DECIMAL(12,2) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create maintenance table
        await client.query(`
            CREATE TABLE IF NOT EXISTS maintenance (
                maintenance_id SERIAL PRIMARY KEY,
                truck_id INTEGER REFERENCES trucks(truck_id),
                service_date DATE NOT NULL,
                description TEXT,
                cost DECIMAL(12,2) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('  ✔ gps_logs, fuel_logs, maintenance tables ensured');

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
        await client.query('CREATE INDEX IF NOT EXISTS idx_gps_logs_recorded_at ON gps_logs(recorded_at)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_fuel_logs_trip_id ON fuel_logs(trip_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_truck_id ON expenses(truck_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_invoices_trip_id ON invoices(trip_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status)');

        // Create notifications table
        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                notification_id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                type VARCHAR(50) NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                related_trip_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)');
        console.log('  ✔ notifications table created');

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
