const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function initDatabase() {
    try {
        const db = await open({
            filename: path.join(__dirname, '../../database.sqlite'),
            driver: sqlite3.Database
        });

        console.log('Using SQLite database at database.sqlite');

        // Enable foreign keys
        await db.run('PRAGMA foreign_keys = ON');

        // Create users table
        await db.run(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'driver', 'manager')),
                name TEXT NOT NULL,
                phone TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create trucks table
        await db.run(`
            CREATE TABLE IF NOT EXISTS trucks (
                truck_id INTEGER PRIMARY KEY AUTOINCREMENT,
                truck_number TEXT UNIQUE NOT NULL,
                capacity REAL NOT NULL,
                status TEXT DEFAULT 'Available' CHECK(status IN ('Available', 'Assigned', 'Maintenance')),
                insurance_expiry TEXT NOT NULL,
                fitness_expiry TEXT NOT NULL,
                deleted_at TEXT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create drivers table
        await db.run(`
            CREATE TABLE IF NOT EXISTS drivers (
                driver_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NULL,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                license_number TEXT UNIQUE NOT NULL,
                license_expiry TEXT NOT NULL,
                status TEXT DEFAULT 'Available' CHECK(status IN ('Available', 'Assigned')),
                assigned_truck_id INTEGER NULL,
                deleted_at TEXT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (assigned_truck_id) REFERENCES trucks(truck_id) ON DELETE SET NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
            )
        `);

        // MODULE 4: TRIPS TABLE
        await db.run(`
            CREATE TABLE IF NOT EXISTS trips (
                trip_id INTEGER PRIMARY KEY AUTOINCREMENT,
                truck_id INTEGER NOT NULL,
                driver_id INTEGER NOT NULL,
                lr_number TEXT UNIQUE NOT NULL,
                source TEXT NOT NULL,
                destination TEXT NOT NULL,
                distance_km REAL DEFAULT 0,
                freight_amount REAL DEFAULT 0,
                start_time TEXT,
                end_time TEXT,
                status TEXT DEFAULT 'Planned' CHECK(status IN ('Planned', 'Running', 'Completed', 'Cancelled')),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (truck_id) REFERENCES trucks(truck_id),
                FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
            )
        `);

        // MODULE 5: GPS LOGS TABLE
        await db.run(`
            CREATE TABLE IF NOT EXISTS gps_logs (
                gps_id INTEGER PRIMARY KEY AUTOINCREMENT,
                truck_id INTEGER NOT NULL,
                trip_id INTEGER NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (truck_id) REFERENCES trucks(truck_id),
                FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
            )
        `);

        // MODULE 6: FUEL LOGS TABLE
        await db.run(`
            CREATE TABLE IF NOT EXISTS fuel_logs (
                fuel_id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id INTEGER NOT NULL,
                liters REAL NOT NULL,
                price_per_liter REAL NOT NULL,
                total_cost REAL NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
            )
        `);

        // MODULE 7: MAINTENANCE TABLE
        await db.run(`
            CREATE TABLE IF NOT EXISTS maintenance (
                maintenance_id INTEGER PRIMARY KEY AUTOINCREMENT,
                truck_id INTEGER NOT NULL,
                service_date TEXT NOT NULL,
                description TEXT NOT NULL,
                cost REAL NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (truck_id) REFERENCES trucks(truck_id)
            )
        `);

        // MODULE 8: INVOICES TABLE
        await db.run(`
            CREATE TABLE IF NOT EXISTS invoices (
                invoice_id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id INTEGER NOT NULL,
                total_amount REAL NOT NULL,
                advance_amount REAL DEFAULT 0,
                balance_amount REAL DEFAULT 0,
                payment_status TEXT DEFAULT 'Pending' CHECK(payment_status IN ('Pending', 'Paid', 'Partial')),
                invoice_date TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
            )
        `);

        await db.close();
        console.log('✅ SQLite Database and tables initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        return false;
    }
}

module.exports = initDatabase;
