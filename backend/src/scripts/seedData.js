const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedData() {
    const client = await pool.connect();

    try {
        console.log('🌱 Starting data seeding...\n');

        // ==================== USERS ====================
        console.log('👥 Creating users...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('1234', salt);

        const users = [
            { email: 'admin@gmail.com', password_hash: hashedPassword, role: 'admin', name: 'System Admin', phone: '9876543210' },
            { email: 'manager@gmail.com', password_hash: hashedPassword, role: 'manager', name: 'Operations Manager', phone: '9876543211' },
            { email: 'driver1@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Rajesh Kumar', phone: '9876543212' },
            { email: 'driver2@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Suresh Patel', phone: '9876543213' },
            { email: 'driver3@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Ramesh Singh', phone: '9876543214' },
            { email: 'driver4@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Vijay Sharma', phone: '9876543215' },
            { email: 'driver5@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Anil Verma', phone: '9876543216' },
            { email: 'driver6@gmail.com', password_hash: hashedPassword, role: 'driver', name: 'Prakash Reddy', phone: '9876543217' },
        ];

        const userIds = [];
        for (const user of users) {
            const existing = await client.query('SELECT user_id FROM users WHERE email = $1', [user.email]);
            if (existing.rows.length > 0) {
                console.log(`  ⚠️  User ${user.email} already exists, skipping...`);
                userIds.push(existing.rows[0].user_id);
            } else {
                const result = await client.query(
                    'INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
                    [user.email, user.password_hash, user.role, user.name, user.phone]
                );
                userIds.push(result.rows[0].user_id);
                console.log(`  ✅ Created user: ${user.name} (${user.email})`);
            }
        }

        // ==================== TRUCKS ====================
        console.log('\n🚚 Creating trucks...');
        const trucks = [
            { truck_number: 'TN01AB1234', capacity: 15.5, status: 'Available', insurance_expiry: '2025-12-31', fitness_expiry: '2025-11-30' },
            { truck_number: 'TN02CD5678', capacity: 12.0, status: 'Available', insurance_expiry: '2025-10-15', fitness_expiry: '2025-09-20' },
            { truck_number: 'TN03EF9012', capacity: 18.0, status: 'Available', insurance_expiry: '2026-01-20', fitness_expiry: '2025-12-15' },
            { truck_number: 'KA01GH3456', capacity: 10.5, status: 'Available', insurance_expiry: '2025-08-30', fitness_expiry: '2025-07-25' },
            { truck_number: 'KA02IJ7890', capacity: 14.0, status: 'Available', insurance_expiry: '2025-11-10', fitness_expiry: '2025-10-05' },
            { truck_number: 'MH01KL2345', capacity: 16.5, status: 'Available', insurance_expiry: '2026-02-28', fitness_expiry: '2026-01-15' },
            { truck_number: 'MH02MN6789', capacity: 13.5, status: 'Available', insurance_expiry: '2025-09-15', fitness_expiry: '2025-08-10' },
            { truck_number: 'AP01OP1234', capacity: 11.0, status: 'Available', insurance_expiry: '2025-12-20', fitness_expiry: '2025-11-15' },
        ];

        const truckIds = [];
        for (const truck of trucks) {
            const existing = await client.query('SELECT truck_id FROM trucks WHERE truck_number = $1', [truck.truck_number]);
            if (existing.rows.length > 0) {
                console.log(`  ⚠️  Truck ${truck.truck_number} already exists, skipping...`);
                truckIds.push(existing.rows[0].truck_id);
            } else {
                const result = await client.query(
                    'INSERT INTO trucks (truck_number, capacity, status, insurance_expiry, fitness_expiry) VALUES ($1, $2, $3, $4, $5) RETURNING truck_id',
                    [truck.truck_number, truck.capacity, truck.status, truck.insurance_expiry, truck.fitness_expiry]
                );
                truckIds.push(result.rows[0].truck_id);
                console.log(`  ✅ Created truck: ${truck.truck_number} (${truck.capacity}T)`);
            }
        }

        // ==================== DRIVERS ====================
        console.log('\n👨‍✈️ Creating drivers...');
        const drivers = [
            { user_id: userIds[2], name: 'Rajesh Kumar', phone: '9876543212', license_number: 'DL01234567890', license_expiry: '2027-06-30', status: 'Available' },
            { user_id: userIds[3], name: 'Suresh Patel', phone: '9876543213', license_number: 'DL01234567891', license_expiry: '2026-08-15', status: 'Available' },
            { user_id: userIds[4], name: 'Ramesh Singh', phone: '9876543214', license_number: 'DL01234567892', license_expiry: '2027-03-20', status: 'Available' },
            { user_id: userIds[5], name: 'Vijay Sharma', phone: '9876543215', license_number: 'DL01234567893', license_expiry: '2026-12-10', status: 'Available' },
            { user_id: userIds[6], name: 'Anil Verma', phone: '9876543216', license_number: 'DL01234567894', license_expiry: '2027-01-25', status: 'Available' },
            { user_id: userIds[7], name: 'Prakash Reddy', phone: '9876543217', license_number: 'DL01234567895', license_expiry: '2026-09-30', status: 'Available' },
        ];

        const driverIds = [];
        for (const driver of drivers) {
            const existing = await client.query('SELECT driver_id FROM drivers WHERE license_number = $1', [driver.license_number]);
            if (existing.rows.length > 0) {
                console.log(`  ⚠️  Driver ${driver.name} already exists, skipping...`);
                driverIds.push(existing.rows[0].driver_id);
            } else {
                const result = await client.query(
                    'INSERT INTO drivers (user_id, name, phone, license_number, license_expiry, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING driver_id',
                    [driver.user_id, driver.name, driver.phone, driver.license_number, driver.license_expiry, driver.status]
                );
                driverIds.push(result.rows[0].driver_id);
                console.log(`  ✅ Created driver: ${driver.name} (License: ${driver.license_number})`);
            }
        }

        // ==================== TRIPS ====================
        console.log('\n🗺️  Creating trips...');
        const trips = [
            // Completed trips
            { truck_id: truckIds[0], driver_id: driverIds[0], lr_number: 'LR2024001', source: 'Chennai', destination: 'Bangalore', distance_km: 345.5, freight_amount: 25000, start_time: '2024-01-15 08:00:00', end_time: '2024-01-15 18:30:00', status: 'Completed' },
            { truck_id: truckIds[1], driver_id: driverIds[1], lr_number: 'LR2024002', source: 'Mumbai', destination: 'Pune', distance_km: 150.0, freight_amount: 12000, start_time: '2024-01-16 06:00:00', end_time: '2024-01-16 12:00:00', status: 'Completed' },
            { truck_id: truckIds[2], driver_id: driverIds[2], lr_number: 'LR2024003', source: 'Delhi', destination: 'Jaipur', distance_km: 280.0, freight_amount: 18000, start_time: '2024-01-17 07:00:00', end_time: '2024-01-17 15:00:00', status: 'Completed' },
            { truck_id: truckIds[3], driver_id: driverIds[3], lr_number: 'LR2024004', source: 'Hyderabad', destination: 'Vijayawada', distance_km: 275.0, freight_amount: 16500, start_time: '2024-01-18 09:00:00', end_time: '2024-01-18 17:00:00', status: 'Completed' },
            { truck_id: truckIds[0], driver_id: driverIds[0], lr_number: 'LR2024005', source: 'Bangalore', destination: 'Mysore', distance_km: 145.0, freight_amount: 11000, start_time: '2024-01-20 08:30:00', end_time: '2024-01-20 14:00:00', status: 'Completed' },
            { truck_id: truckIds[4], driver_id: driverIds[4], lr_number: 'LR2024006', source: 'Kolkata', destination: 'Bhubaneswar', distance_km: 445.0, freight_amount: 28000, start_time: '2024-01-22 05:00:00', end_time: '2024-01-22 19:00:00', status: 'Completed' },
            { truck_id: truckIds[5], driver_id: driverIds[5], lr_number: 'LR2024007', source: 'Ahmedabad', destination: 'Surat', distance_km: 265.0, freight_amount: 15000, start_time: '2024-01-23 07:30:00', end_time: '2024-01-23 14:30:00', status: 'Completed' },

            // Running trips
            { truck_id: truckIds[1], driver_id: driverIds[1], lr_number: 'LR2024008', source: 'Chennai', destination: 'Coimbatore', distance_km: 505.0, freight_amount: 32000, start_time: '2024-01-30 06:00:00', end_time: null, status: 'Running' },
            { truck_id: truckIds[2], driver_id: driverIds[2], lr_number: 'LR2024009', source: 'Mumbai', destination: 'Goa', distance_km: 585.0, freight_amount: 35000, start_time: '2024-01-30 08:00:00', end_time: null, status: 'Running' },

            // Planned trips
            { truck_id: truckIds[6], driver_id: driverIds[3], lr_number: 'LR2024010', source: 'Delhi', destination: 'Chandigarh', distance_km: 245.0, freight_amount: 14000, start_time: null, end_time: null, status: 'Planned' },
            { truck_id: truckIds[7], driver_id: driverIds[4], lr_number: 'LR2024011', source: 'Bangalore', destination: 'Chennai', distance_km: 345.0, freight_amount: 24000, start_time: null, end_time: null, status: 'Planned' },
            { truck_id: truckIds[3], driver_id: driverIds[5], lr_number: 'LR2024012', source: 'Hyderabad', destination: 'Bangalore', distance_km: 575.0, freight_amount: 38000, start_time: null, end_time: null, status: 'Planned' },
        ];

        const tripIds = [];
        for (const trip of trips) {
            const existing = await client.query('SELECT trip_id FROM trips WHERE lr_number = $1', [trip.lr_number]);
            if (existing.rows.length > 0) {
                console.log(`  ⚠️  Trip ${trip.lr_number} already exists, skipping...`);
                tripIds.push(existing.rows[0].trip_id);
            } else {
                const result = await client.query(
                    'INSERT INTO trips (truck_id, driver_id, lr_number, source, destination, distance_km, freight_amount, start_time, end_time, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING trip_id',
                    [trip.truck_id, trip.driver_id, trip.lr_number, trip.source, trip.destination, trip.distance_km, trip.freight_amount, trip.start_time, trip.end_time, trip.status]
                );
                tripIds.push(result.rows[0].trip_id);
                console.log(`  ✅ Created trip: ${trip.lr_number} (${trip.source} → ${trip.destination}) [${trip.status}]`);
            }
        }

        // ==================== FUEL LOGS ====================
        console.log('\n⛽ Creating fuel logs...');
        const fuelLogs = [
            { trip_id: tripIds[0], liters: 45.5, price_per_liter: 95.50, total_cost: 4345.25 },
            { trip_id: tripIds[0], liters: 38.0, price_per_liter: 96.00, total_cost: 3648.00 },
            { trip_id: tripIds[1], liters: 28.5, price_per_liter: 94.75, total_cost: 2700.38 },
            { trip_id: tripIds[2], liters: 42.0, price_per_liter: 95.25, total_cost: 4000.50 },
            { trip_id: tripIds[3], liters: 40.5, price_per_liter: 93.80, total_cost: 3798.90 },
            { trip_id: tripIds[4], liters: 25.0, price_per_liter: 96.20, total_cost: 2405.00 },
            { trip_id: tripIds[5], liters: 55.0, price_per_liter: 94.50, total_cost: 5197.50 },
            { trip_id: tripIds[6], liters: 38.5, price_per_liter: 95.75, total_cost: 3686.38 },
            { trip_id: tripIds[7], liters: 50.0, price_per_liter: 96.50, total_cost: 4825.00 },
            { trip_id: tripIds[8], liters: 48.5, price_per_liter: 95.00, total_cost: 4607.50 },
        ];

        for (const fuel of fuelLogs) {
            await client.query(
                'INSERT INTO fuel_logs (trip_id, liters, price_per_liter, total_cost) VALUES ($1, $2, $3, $4)',
                [fuel.trip_id, fuel.liters, fuel.price_per_liter, fuel.total_cost]
            );
        }
        console.log(`  ✅ Created ${fuelLogs.length} fuel log entries`);

        // ==================== GPS LOGS ====================
        console.log('\n📍 Creating GPS logs...');
        const gpsLogs = [
            // Trip 1: Chennai to Bangalore
            { truck_id: truckIds[0], trip_id: tripIds[0], latitude: 13.0827, longitude: 80.2707 }, // Chennai
            { truck_id: truckIds[0], trip_id: tripIds[0], latitude: 12.9716, longitude: 77.5946 }, // Bangalore

            // Trip 2: Mumbai to Pune
            { truck_id: truckIds[1], trip_id: tripIds[1], latitude: 19.0760, longitude: 72.8777 }, // Mumbai
            { truck_id: truckIds[1], trip_id: tripIds[1], latitude: 18.5204, longitude: 73.8567 }, // Pune

            // Running Trip 1: Chennai to Coimbatore
            { truck_id: truckIds[1], trip_id: tripIds[7], latitude: 13.0827, longitude: 80.2707 }, // Chennai
            { truck_id: truckIds[1], trip_id: tripIds[7], latitude: 12.4996, longitude: 78.8384 }, // Midway
            { truck_id: truckIds[1], trip_id: tripIds[7], latitude: 11.6643, longitude: 78.1460 }, // Current position

            // Running Trip 2: Mumbai to Goa
            { truck_id: truckIds[2], trip_id: tripIds[8], latitude: 19.0760, longitude: 72.8777 }, // Mumbai
            { truck_id: truckIds[2], trip_id: tripIds[8], latitude: 17.6599, longitude: 74.2403 }, // Midway
            { truck_id: truckIds[2], trip_id: tripIds[8], latitude: 16.5544, longitude: 74.3122 }, // Current position
        ];

        for (const gps of gpsLogs) {
            await client.query(
                'INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude) VALUES ($1, $2, $3, $4)',
                [gps.truck_id, gps.trip_id, gps.latitude, gps.longitude]
            );
        }
        console.log(`  ✅ Created ${gpsLogs.length} GPS log entries`);

        // ==================== MAINTENANCE ====================
        console.log('\n🔧 Creating maintenance records...');
        const maintenanceRecords = [
            { truck_id: truckIds[0], service_date: '2024-01-10', description: 'Engine oil change and filter replacement', cost: 3500.00 },
            { truck_id: truckIds[1], service_date: '2024-01-12', description: 'Brake pad replacement', cost: 5200.00 },
            { truck_id: truckIds[2], service_date: '2024-01-14', description: 'Tire rotation and alignment', cost: 2800.00 },
            { truck_id: truckIds[3], service_date: '2024-01-16', description: 'AC servicing and gas refill', cost: 4100.00 },
            { truck_id: truckIds[4], service_date: '2024-01-18', description: 'Battery replacement', cost: 6500.00 },
            { truck_id: truckIds[0], service_date: '2024-01-25', description: 'General servicing and inspection', cost: 4500.00 },
        ];

        for (const maintenance of maintenanceRecords) {
            await client.query(
                'INSERT INTO maintenance (truck_id, service_date, description, cost) VALUES ($1, $2, $3, $4)',
                [maintenance.truck_id, maintenance.service_date, maintenance.description, maintenance.cost]
            );
        }
        console.log(`  ✅ Created ${maintenanceRecords.length} maintenance records`);

        // ==================== INVOICES ====================
        console.log('\n🧾 Creating invoices...');
        const invoices = [
            { trip_id: tripIds[0], total_amount: 25000, advance_amount: 10000, balance_amount: 15000, payment_status: 'Paid', invoice_date: '2024-01-15' },
            { trip_id: tripIds[1], total_amount: 12000, advance_amount: 5000, balance_amount: 7000, payment_status: 'Paid', invoice_date: '2024-01-16' },
            { trip_id: tripIds[2], total_amount: 18000, advance_amount: 8000, balance_amount: 10000, payment_status: 'Paid', invoice_date: '2024-01-17' },
            { trip_id: tripIds[3], total_amount: 16500, advance_amount: 7000, balance_amount: 9500, payment_status: 'Partial', invoice_date: '2024-01-18' },
            { trip_id: tripIds[4], total_amount: 11000, advance_amount: 5000, balance_amount: 6000, payment_status: 'Paid', invoice_date: '2024-01-20' },
            { trip_id: tripIds[5], total_amount: 28000, advance_amount: 12000, balance_amount: 16000, payment_status: 'Partial', invoice_date: '2024-01-22' },
            { trip_id: tripIds[6], total_amount: 15000, advance_amount: 0, balance_amount: 15000, payment_status: 'Pending', invoice_date: '2024-01-23' },
        ];

        for (const invoice of invoices) {
            await client.query(
                'INSERT INTO invoices (trip_id, total_amount, advance_amount, balance_amount, payment_status, invoice_date) VALUES ($1, $2, $3, $4, $5, $6)',
                [invoice.trip_id, invoice.total_amount, invoice.advance_amount, invoice.balance_amount, invoice.payment_status, invoice.invoice_date]
            );
        }
        console.log(`  ✅ Created ${invoices.length} invoices`);

        console.log('\n✨ Data seeding completed successfully!\n');
        console.log('📊 Summary:');
        console.log(`   - Users: ${users.length}`);
        console.log(`   - Trucks: ${trucks.length}`);
        console.log(`   - Drivers: ${drivers.length}`);
        console.log(`   - Trips: ${trips.length} (${trips.filter(t => t.status === 'Completed').length} completed, ${trips.filter(t => t.status === 'Running').length} running, ${trips.filter(t => t.status === 'Planned').length} planned)`);
        console.log(`   - Fuel Logs: ${fuelLogs.length}`);
        console.log(`   - GPS Logs: ${gpsLogs.length}`);
        console.log(`   - Maintenance Records: ${maintenanceRecords.length}`);
        console.log(`   - Invoices: ${invoices.length}`);
        console.log('\n🔐 Login Credentials (password for all: 1234):');
        console.log('   - Admin: admin@gmail.com');
        console.log('   - Manager: manager@gmail.com');
        console.log('   - Drivers: driver1@gmail.com to driver6@gmail.com');

    } catch (error) {
        console.error('❌ Error seeding data:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

seedData();
