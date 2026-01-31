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

        // Create GPS logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS gps_logs (
                gps_id SERIAL PRIMARY KEY,
                truck_id INTEGER NOT NULL,
                trip_id INTEGER NOT NULL,
                latitude DECIMAL(9,6) NOT NULL,
                longitude DECIMAL(9,6) NOT NULL,
                recorded_at TIMESTAMP DEFAULT NOW(),
                FOREIGN KEY (truck_id) REFERENCES trucks(truck_id),
                FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
            )
        `);

        // Create fuel logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS fuel_logs (
                fuel_id SERIAL PRIMARY KEY,
                trip_id INTEGER NOT NULL,
                liters DECIMAL(10,2) NOT NULL,
                price_per_liter DECIMAL(10,2) NOT NULL,
                total_cost DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
            )
        `);

        // Create maintenance table
        await client.query(`
            CREATE TABLE IF NOT EXISTS maintenance (
                maintenance_id SERIAL PRIMARY KEY,
                truck_id INTEGER NOT NULL,
                service_date DATE NOT NULL,
                description TEXT NOT NULL,
                cost DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                FOREIGN KEY (truck_id) REFERENCES trucks(truck_id)
            )
        `);

        // Create invoices table
        await client.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                invoice_id SERIAL PRIMARY KEY,
                trip_id INTEGER NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                advance_amount DECIMAL(10,2) DEFAULT 0,
                balance_amount DECIMAL(10,2) DEFAULT 0,
                payment_status VARCHAR(20) DEFAULT 'Pending' CHECK(payment_status IN ('Pending', 'Paid', 'Partial')),
                invoice_date DATE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
            )
        `);

        // Create indexes for performance
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON drivers(user_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_trips_truck_id ON trips(truck_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips(driver_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_gps_logs_trip_id ON gps_logs(trip_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_fuel_logs_trip_id ON fuel_logs(trip_id)');

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
