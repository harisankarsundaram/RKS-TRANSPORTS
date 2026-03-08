const pool = require('../src/config/db');
const bcrypt = require('bcryptjs');

async function seed() {
    let client = null;
    try {
        console.log('🌱 Starting database seeding...');
        client = await pool.connect();

        // 0. Clean old data
        await client.query('TRUNCATE TABLE invoices, expenses, fuel_logs, gps_logs, maintenance, trips, drivers, trucks, users RESTART IDENTITY CASCADE');
        console.log('🧹 Cleaned existing data.');

        const passwordHash = await bcrypt.hash('password123', 10);

        // 1. Users
        console.log('👤 Creating users...');
        const createUserInfo = async (email, name, role, phone) => {
            const res = await client.query(
                'INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
                [email, passwordHash, role, name, phone]
            );
            return res.rows[0].user_id;
        };

        const adminId = await createUserInfo('admin@rks.com', 'System Admin', 'admin', '9876543210');
        const d1UserId = await createUserInfo('driver1@rks.com', 'Rajesh Kumar', 'driver', '9876543211');
        const d2UserId = await createUserInfo('driver2@rks.com', 'Amit Singh', 'driver', '9876543212');
        const d3UserId = await createUserInfo('driver3@rks.com', 'Vijay Sharma', 'driver', '9876543213');

        // 2. Trucks
        console.log('🚚 Creating trucks...');
        const createTruck = async (num, cap, status) => {
            const res = await client.query(
                'INSERT INTO trucks (truck_number, capacity, status, insurance_expiry, fitness_expiry) VALUES ($1, $2, $3, $4, $5) RETURNING truck_id',
                [num, cap, status, '2025-12-31', '2025-12-31']
            );
            return res.rows[0].truck_id;
        };

        const t1Id = await createTruck('KA-01-AB-1234', 16, 'Assigned');
        const t2Id = await createTruck('KA-02-CD-5678', 12, 'Assigned');
        const t3Id = await createTruck('TN-01-EF-9012', 20, 'Maintenance');
        const t4Id = await createTruck('AP-03-GH-3456', 25, 'Available');

        // 3. Drivers
        console.log('👨‍✈️ Creating drivers...');
        const createDriver = async (userId, name, phone, license, status, truckId) => {
            const res = await client.query(
                'INSERT INTO drivers (user_id, name, phone, license_number, license_expiry, status, assigned_truck_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING driver_id',
                [userId, name, phone, license, '2030-01-01', status, truckId]
            );
            return res.rows[0].driver_id;
        };

        const d1Id = await createDriver(d1UserId, 'Rajesh Kumar', '9876543211', 'DL-12345678', 'Assigned', t1Id);
        const d2Id = await createDriver(d2UserId, 'Amit Singh', '9876543212', 'DL-87654321', 'Assigned', t2Id);
        const d3Id = await createDriver(d3UserId, 'Vijay Sharma', '9876543213', 'DL-13572468', 'Available', null);

        // 4. Trips
        console.log('🛣️ Creating trips...');
        const createTrip = async (truckId, driverId, lr, src, dest, dist, status, freight, toll, billableToll, bata, empty, loaded, gst, daysOld) => {
            const res = await client.query(
                `INSERT INTO trips (
                    truck_id, driver_id, lr_number, source, destination, 
                    distance_km, status, created_at, base_freight, 
                    toll_amount, toll_billable, driver_bata, empty_km, 
                    loaded_km, gst_percentage
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - ($8 * INTERVAL '1 day'), $9, $10, $11, $12, $13, $14, $15) RETURNING trip_id`,
                [truckId, driverId, lr, src, dest, dist, status, daysOld, freight, toll, billableToll, bata, empty, loaded, gst]
            );
            return res.rows[0].trip_id;
        };

        const trip1Id = await createTrip(t1Id, d1Id, 'LR-1001', 'Bangalore', 'Chennai', 350, 'Completed', 45000, 1500, true, 2000, 20, 330, 5, 5);
        const trip2Id = await createTrip(t2Id, d2Id, 'LR-1002', 'Hyderabad', 'Mumbai', 700, 'Completed', 85000, 4000, true, 3500, 50, 650, 12, 10);
        const trip3Id = await createTrip(t1Id, d1Id, 'LR-1003', 'Chennai', 'Bangalore', 150, 'Running', 40000, 1500, false, 1500, 10, 140, 5, 1);
        const trip4Id = await createTrip(t2Id, d2Id, 'LR-1004', 'Mumbai', 'Pune', 0, 'Planned', 15000, 0, false, 0, 0, 0, 5, 0);

        // 5. Expenses
        console.log('💸 Creating expenses...');
        const createExpense = async (tripId, truckId, cat, amt, desc) => {
            await client.query(
                "INSERT INTO expenses (trip_id, truck_id, category, amount, description) VALUES ($1, $2, $3, $4, $5)",
                [tripId, truckId, cat, amt, desc]
            );
        };

        await createExpense(trip1Id, t1Id, 'Fuel', 12000, 'Diesel filled at HP Pump');
        await createExpense(trip1Id, t1Id, 'Misc', 500, 'Unloading help');
        await createExpense(trip2Id, t2Id, 'Fuel', 25000, 'Full tank diesel');
        await createExpense(trip3Id, t1Id, 'Fuel', 5000, 'Top up');

        // 6. Maintenance
        console.log('🔧 Creating maintenance logs...');
        await client.query(
            "INSERT INTO maintenance (truck_id, service_date, description, cost) VALUES ($1, $2, $3, $4)",
            [t3Id, '2024-03-01', 'Oil change and brake service', 15000]
        );

        // 7. Invoices
        console.log('🧾 Creating invoices...');
        const createInvoice = async (tripId, num, date, due, sub, gst, total, status, paid) => {
            await client.query(
                `INSERT INTO invoices (trip_id, invoice_number, invoice_date, due_date, subtotal, gst_amount, total_amount, payment_status, amount_paid) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [tripId, num, date, due, sub, gst, total, status, paid]
            );
        };

        const subtotal1 = 45000 + 1500;
        const gst1 = subtotal1 * 0.05;
        await createInvoice(trip1Id, 'RKS-INV-2024001', '2024-03-01', '2024-03-15', subtotal1, gst1, subtotal1 + gst1, 'Pending', 0);

        const subtotal2 = 85000 + 4000;
        const gst2 = subtotal2 * 0.12;
        await createInvoice(trip2Id, 'RKS-INV-2024002', '2024-02-25', '2024-03-10', subtotal2, gst2, subtotal2 + gst2, 'Paid', subtotal2 + gst2);

        console.log('✅ Seeding completed successfully!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

seed();
