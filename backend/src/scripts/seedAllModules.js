const pool = require('../config/db');
const bcrypt = require('bcryptjs');

async function seedAllModules() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting Unified Data Seeding for All Modules...\n');

        // Clean up existing data to avoid conflicts, in reverse order of dependencies
        console.log('🧹 Cleaning up existing data...');
        await client.query('DELETE FROM invoices');
        await client.query('DELETE FROM expenses');
        await client.query('DELETE FROM fuel_logs');
        await client.query('DELETE FROM gps_logs');
        await client.query('DELETE FROM maintenance');
        await client.query('DELETE FROM trips');
        await client.query('DELETE FROM drivers');
        await client.query('DELETE FROM trucks');
        await client.query('DELETE FROM users');
        console.log('✅ Cleanup complete.\n');

        // ==================== USERS ====================
        console.log('👤 Seeding Users...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('1234', salt);

        const userData = [
            { email: 'admin@gmail.com', password_hash: hashedPassword, role: 'admin', name: 'System Admin', phone: '9876543210' },
            { email: 'manager@gmail.com', password_hash: hashedPassword, role: 'manager', name: 'Operations Manager', phone: '9876543211' },
            { email: 'driver1@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Rajesh Kumar', phone: '9876543212' },
            { email: 'driver2@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Suresh Patel', phone: '9876543213' },
            { email: 'driver3@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Ramesh Singh', phone: '9876543214' },
            { email: 'driver4@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Vijay Sharma', phone: '9876543215' },
            { email: 'driver5@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Anil Verma', phone: '9876543216' },
        ];

        const userResults = [];
        for (const user of userData) {
            const res = await client.query(
                'INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, role',
                [user.email, user.password_hash, user.role, user.name, user.phone]
            );
            userResults.push(res.rows[0]);
        }
        console.log(`✅ Seeded ${userResults.length} users.`);

        // ==================== TRUCKS ====================
        console.log('🚚 Seeding Trucks...');
        const truckData = [
            { truck_number: 'TN01AB1234', capacity: 15.5, status: 'Available', insurance_expiry: '2025-12-31', fitness_expiry: '2025-11-30' },
            { truck_number: 'TN02CD5678', capacity: 12.0, status: 'Available', insurance_expiry: '2025-10-15', fitness_expiry: '2025-09-20' },
            { truck_number: 'TN03EF9012', capacity: 18.0, status: 'Available', insurance_expiry: '2026-01-20', fitness_expiry: '2025-12-15' },
            { truck_number: 'KA01GH3456', capacity: 10.5, status: 'Available', insurance_expiry: '2025-08-30', fitness_expiry: '2025-07-25' },
            { truck_number: 'KA02IJ7890', capacity: 14.0, status: 'Available', insurance_expiry: '2025-11-10', fitness_expiry: '2025-10-05' },
        ];

        const truckResults = [];
        for (const truck of truckData) {
            const res = await client.query(
                'INSERT INTO trucks (truck_number, capacity, status, insurance_expiry, fitness_expiry) VALUES ($1, $2, $3, $4, $5) RETURNING truck_id',
                [truck.truck_number, truck.capacity, truck.status, truck.insurance_expiry, truck.fitness_expiry]
            );
            truckResults.push(res.rows[0]);
        }
        console.log(`✅ Seeded ${truckResults.length} trucks.`);

        // ==================== DRIVERS ====================
        console.log('👨‍✈️ Seeding Drivers...');
        const drivers = userResults.filter(u => u.role === 'driver');
        const driverResults = [];
        for (let i = 0; i < drivers.length; i++) {
            const res = await client.query(
                'INSERT INTO drivers (user_id, name, phone, license_number, license_expiry, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING driver_id',
                [drivers[i].user_id, userData.find(u => u.email === `driver${i + 1}@gmail.com`).name, userData.find(u => u.email === `driver${i + 1}@gmail.com`).phone, `LIC-${1000 + i}`, '2030-01-01', 'Available']
            );
            driverResults.push(res.rows[0]);
        }
        console.log(`✅ Seeded ${driverResults.length} drivers.`);

        // ==================== TRIPS ====================
        console.log('🗺️ Seeding Trips...');
        const tripData = [
            { truck_idx: 0, driver_idx: 0, lr: 'LR24-0001', src: 'Chennai', dst: 'Bangalore', dist: 350, base: 25000, status: 'Completed', start: '2024-01-10 08:00:00', end: '2024-01-10 18:00:00' },
            { truck_idx: 1, driver_idx: 1, lr: 'LR24-0002', src: 'Bangalore', dst: 'Hyderabad', dist: 570, base: 38000, status: 'Completed', start: '2024-01-12 06:00:00', end: '2024-01-13 02:00:00' },
            { truck_idx: 2, driver_idx: 2, lr: 'LR24-0003', src: 'Hyderabad', dst: 'Mumbai', dist: 710, base: 45000, status: 'Completed', start: '2024-01-15 05:00:00', end: '2024-01-16 04:00:00' },
            { truck_idx: 0, driver_idx: 0, lr: 'LR24-0004', src: 'Mumbai', dst: 'Chennai', dist: 1330, base: 85000, status: 'Running', start: '2024-01-20 09:00:00', end: null },
            { truck_idx: 3, driver_idx: 3, lr: 'LR24-0005', src: 'Delhi', dst: 'Jaipur', dist: 280, base: 18000, status: 'Planned', start: null, end: null },
        ];

        const tripResults = [];
        for (const trip of tripData) {
            const res = await client.query(
                `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination, distance_km, base_freight, start_time, end_time, status, toll_amount, loading_cost, unloading_cost, gst_percentage) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING trip_id, status, distance_km, truck_id, driver_id`,
                [
                    truckResults[trip.truck_idx].truck_id,
                    driverResults[trip.driver_idx].driver_id,
                    trip.lr, trip.src, trip.dst, trip.dist, trip.base,
                    trip.start, trip.end, trip.status,
                    trip.status === 'Completed' ? 1200 : 0,
                    trip.status === 'Completed' ? 500 : 0,
                    trip.status === 'Completed' ? 500 : 0,
                    18.0
                ]
            );
            tripResults.push(res.rows[0]);

            // If running, update truck and driver status
            if (trip.status === 'Running') {
                await client.query('UPDATE trucks SET status = $1 WHERE truck_id = $2', ['Assigned', res.rows[0].truck_id]);
                await client.query('UPDATE drivers SET status = $1, assigned_truck_id = $2 WHERE driver_id = $3', ['Assigned', res.rows[0].truck_id, res.rows[0].driver_id]);
            }
        }
        console.log(`✅ Seeded ${tripResults.length} trips.`);

        // ==================== FUEL LOGS ====================
        console.log('⛽ Seeding Fuel Logs...');
        let fuelCount = 0;
        for (const trip of tripResults) {
            if (trip.status === 'Planned') continue;

            const logs = trip.status === 'Completed' ? 2 : 1;
            for (let i = 0; i < logs; i++) {
                const liters = 50 + (i * 10);
                const price = 96.50;
                await client.query(
                    'INSERT INTO fuel_logs (trip_id, liters, price_per_liter, total_cost, created_at) VALUES ($1, $2, $3, $4, NOW())',
                    [trip.trip_id, liters, price, liters * price]
                );
                fuelCount++;
            }
        }
        console.log(`✅ Seeded ${fuelCount} fuel logs.`);

        // ==================== GPS LOGS ====================
        console.log('📍 Seeding GPS Logs...');
        let gpsCount = 0;
        const locations = {
            'Chennai': { lat: 13.0827, lng: 80.2707 },
            'Bangalore': { lat: 12.9716, lng: 77.5946 },
            'Hyderabad': { lat: 17.3850, lng: 78.4867 },
            'Mumbai': { lat: 19.0760, lng: 72.8777 },
        };

        for (const trip of tripData) {
            const tripRes = tripResults.find(r => r.lr_number === trip.lr); // This won't work easily, use index
        }
        // Simplified GPS seeding
        for (let i = 0; i < tripResults.length; i++) {
            const trip = tripResults[i];
            const data = tripData[i];
            if (trip.status === 'Planned') continue;

            const startLoc = locations[data.src] || locations['Chennai'];
            await client.query(
                'INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, recorded_at) VALUES ($1, $2, $3, $4, NOW())',
                [trip.truck_id, trip.trip_id, startLoc.lat, startLoc.lng]
            );
            gpsCount++;

            if (trip.status === 'Completed') {
                const endLoc = locations[data.dst] || locations['Bangalore'];
                await client.query(
                    'INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, recorded_at) VALUES ($1, $2, $3, $4, NOW())',
                    [trip.truck_id, trip.trip_id, endLoc.lat, endLoc.lng]
                );
                gpsCount++;
            }
        }
        console.log(`✅ Seeded ${gpsCount} GPS logs.`);

        // ==================== MAINTENANCE ====================
        console.log('🔧 Seeding Maintenance Records...');
        for (let i = 0; i < truckResults.length; i++) {
            await client.query(
                'INSERT INTO maintenance (truck_id, service_date, description, cost, created_at) VALUES ($1, $2, $3, $4, NOW())',
                [truckResults[i].truck_id, '2024-01-05', `Routine maintenance for ${truckData[i].truck_number}`, 5000 + (i * 1000)]
            );
        }
        console.log(`✅ Seeded ${truckResults.length} maintenance records.`);

        // ==================== EXPENSES ====================
        console.log('💸 Seeding Expenses...');
        const expenseCategories = ['Fuel', 'Toll', 'Maintenance', 'Driver', 'RTO', 'Insurance', 'Misc'];
        let expenseCount = 0;
        for (let i = 0; i < 10; i++) {
            const trip = tripResults[i % tripResults.length];
            if (trip.status === 'Planned') continue;

            await client.query(
                "INSERT INTO expenses (trip_id, truck_id, category, amount, description, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
                [trip.trip_id, trip.truck_id, expenseCategories[i % expenseCategories.length], 200 + (i * 50), `Expense entry #${i + 1}`]
            );
            expenseCount++;
        }
        console.log(`✅ Seeded ${expenseCount} expenses.`);

        // ==================== INVOICES ====================
        console.log('🧾 Seeding Invoices...');
        let invoiceCount = 0;
        for (let i = 0; i < tripResults.length; i++) {
            const trip = tripResults[i];
            if (trip.status !== 'Completed') continue;

            const base = parseFloat(tripData[i].base);
            const extra = 1200 + 500 + 500; // Toll + Loading + Unloading
            const subtotal = base + extra;
            const gst = subtotal * 0.18;
            const total = subtotal + gst;

            await client.query(
                `INSERT INTO invoices (trip_id, invoice_number, invoice_date, due_date, subtotal, gst_amount, total_amount, payment_status, amount_paid, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
                [trip.trip_id, `INV-24-${String(i + 1).padStart(4, '0')}`, '2024-02-01', '2024-02-15', subtotal, gst, total, i % 2 === 0 ? 'Paid' : 'Pending', i % 2 === 0 ? total : 0]
            );
            invoiceCount++;
        }
        console.log(`✅ Seeded ${invoiceCount} invoices.`);

        console.log('\n✨ Unified Data Seeding completed successfully!\n');

    } catch (err) {
        console.error('❌ Seeding failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

seedAllModules();
