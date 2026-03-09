const pool = require('../src/config/db');
const bcrypt = require('bcryptjs');

async function seed() {
    let client = null;
    try {
        console.log('Starting database seeding...');
        client = await pool.connect();

        // 0. Clean all data
        await client.query('TRUNCATE TABLE notifications, invoices, expenses, fuel_logs, gps_logs, maintenance, trips, drivers, trucks, users RESTART IDENTITY CASCADE');
        console.log('Cleaned existing data.');

        const passwordHash = await bcrypt.hash('password123', 10);

        // ── 1. USERS ──
        console.log('Creating users...');
        const insertUser = async (email, name, role, phone) => {
            const res = await client.query(
                'INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
                [email, passwordHash, role, name, phone]
            );
            return res.rows[0].user_id;
        };

        const adminUserId = await insertUser('admin@rks.com', 'System Admin', 'admin', '9876543210');
        const driver1UserId = await insertUser('rajesh@rks.com', 'Rajesh Kumar', 'driver', '9876543211');
        const driver2UserId = await insertUser('amit@rks.com', 'Amit Singh', 'driver', '9876543212');
        const driver3UserId = await insertUser('vijay@rks.com', 'Vijay Sharma', 'driver', '9876543213');
        const driver4UserId = await insertUser('suresh@rks.com', 'Suresh Reddy', 'driver', '9876543214');
        console.log('  Users created: 1 admin + 4 drivers');

        // ── 2. TRUCKS ──
        console.log('Creating trucks...');
        const insertTruck = async (num, cap, status) => {
            const res = await client.query(
                `INSERT INTO trucks (truck_number, capacity, status, insurance_expiry, fitness_expiry)
                 VALUES ($1, $2, $3, '2027-06-30', '2027-03-31') RETURNING truck_id`,
                [num, cap, status]
            );
            return res.rows[0].truck_id;
        };

        const truck1 = await insertTruck('KA-01-AB-1234', 16, 'Assigned');
        const truck2 = await insertTruck('KA-02-CD-5678', 12, 'Assigned');
        const truck3 = await insertTruck('TN-01-EF-9012', 20, 'Maintenance');
        const truck4 = await insertTruck('AP-03-GH-3456', 25, 'Available');
        const truck5 = await insertTruck('KA-05-JK-7890', 14, 'Available');
        console.log('  Trucks created: 5 (2 Assigned, 1 Maintenance, 2 Available)');

        // ── 3. DRIVERS ──
        console.log('Creating drivers...');
        const insertDriver = async (userId, name, phone, license, status, truckId) => {
            const res = await client.query(
                `INSERT INTO drivers (user_id, name, phone, license_number, license_expiry, status, assigned_truck_id)
                 VALUES ($1, $2, $3, $4, '2030-01-01', $5, $6) RETURNING driver_id`,
                [userId, name, phone, license, status, truckId]
            );
            return res.rows[0].driver_id;
        };

        const driver1 = await insertDriver(driver1UserId, 'Rajesh Kumar', '9876543211', 'KA-0120110012345', 'Assigned', truck1);
        const driver2 = await insertDriver(driver2UserId, 'Amit Singh', '9876543212', 'DL-0420090067890', 'Assigned', truck2);
        const driver3 = await insertDriver(driver3UserId, 'Vijay Sharma', '9876543213', 'TN-0920150034567', 'Available', null);
        const driver4 = await insertDriver(driver4UserId, 'Suresh Reddy', '9876543214', 'AP-1320180045678', 'Available', null);
        console.log('  Drivers created: 4 (2 Assigned, 2 Available)');

        // ── 4. TRIPS ──
        console.log('Creating trips...');

        // Trip 1: Completed — Rajesh, truck1 (Bangalore → Chennai) — 10 days ago
        const trip1Res = await client.query(
            `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination,
                distance_km, status, base_freight, toll_amount, toll_billable,
                driver_bata, empty_km, loaded_km, gst_percentage,
                start_time, end_time, created_at)
             VALUES ($1, $2, 'LR-1001', 'Bangalore', 'Chennai',
                350, 'Completed', 45000, 1500, true,
                2000, 20, 330, 5,
                NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '10 days')
             RETURNING trip_id`,
            [truck1, driver1]
        );
        const trip1 = trip1Res.rows[0].trip_id;

        // Trip 2: Completed — Amit, truck2 (Hyderabad → Mumbai) — 15 days ago
        const trip2Res = await client.query(
            `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination,
                distance_km, status, base_freight, toll_amount, toll_billable,
                driver_bata, empty_km, loaded_km, gst_percentage,
                start_time, end_time, created_at)
             VALUES ($1, $2, 'LR-1002', 'Hyderabad', 'Mumbai',
                700, 'Completed', 85000, 4000, true,
                3500, 50, 650, 12,
                NOW() - INTERVAL '15 days', NOW() - INTERVAL '13 days', NOW() - INTERVAL '15 days')
             RETURNING trip_id`,
            [truck2, driver2]
        );
        const trip2 = trip2Res.rows[0].trip_id;

        // Trip 3: Running — Rajesh, truck1 (Chennai → Bangalore) — started 1 day ago
        const trip3Res = await client.query(
            `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination,
                distance_km, status, base_freight, toll_amount, toll_billable,
                driver_bata, empty_km, loaded_km, gst_percentage,
                start_time, created_at)
             VALUES ($1, $2, 'LR-1003', 'Chennai', 'Bangalore',
                150, 'Running', 40000, 1500, false,
                1500, 10, 140, 5,
                NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days')
             RETURNING trip_id`,
            [truck1, driver1]
        );
        const trip3 = trip3Res.rows[0].trip_id;

        // Trip 4: Planned — Amit, truck2 (Mumbai → Pune) — created today
        const trip4Res = await client.query(
            `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination,
                distance_km, status, base_freight, toll_amount, toll_billable,
                driver_bata, empty_km, loaded_km, gst_percentage,
                created_at)
             VALUES ($1, $2, 'LR-1004', 'Mumbai', 'Pune',
                0, 'Planned', 15000, 500, false,
                800, 0, 0, 5,
                NOW())
             RETURNING trip_id`,
            [truck2, driver2]
        );
        const trip4 = trip4Res.rows[0].trip_id;

        // Trip 5: Completed — Rajesh, truck1 (Mysore → Bangalore) — 25 days ago
        const trip5Res = await client.query(
            `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination,
                distance_km, status, base_freight, toll_amount, toll_billable,
                driver_bata, empty_km, loaded_km, gst_percentage,
                start_time, end_time, created_at)
             VALUES ($1, $2, 'LR-1005', 'Mysore', 'Bangalore',
                145, 'Completed', 22000, 500, true,
                1200, 15, 130, 5,
                NOW() - INTERVAL '25 days', NOW() - INTERVAL '24 days', NOW() - INTERVAL '25 days')
             RETURNING trip_id`,
            [truck1, driver1]
        );
        const trip5 = trip5Res.rows[0].trip_id;

        console.log('  Trips created: 5 (3 Completed, 1 Running, 1 Planned)');

        // ── 5. FUEL LOGS ──
        console.log('Creating fuel logs...');
        const insertFuel = async (tripId, liters, ppl) => {
            await client.query(
                `INSERT INTO fuel_logs (trip_id, liters, price_per_liter, total_cost, created_at)
                 VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 hour' * (random()*24)::int)`,
                [tripId, liters, ppl, liters * ppl]
            );
        };

        // Completed trip 1 fuel
        await insertFuel(trip1, 60, 96.50);
        await insertFuel(trip1, 45, 97.00);
        // Completed trip 2 fuel
        await insertFuel(trip2, 80, 95.80);
        await insertFuel(trip2, 75, 96.20);
        await insertFuel(trip2, 50, 95.50);
        // Running trip 3 fuel
        await insertFuel(trip3, 55, 97.50);
        // Completed trip 5 fuel
        await insertFuel(trip5, 40, 94.80);
        console.log('  Fuel logs created: 7 entries across 4 trips');

        // ── 6. GPS LOGS ──
        console.log('Creating GPS logs...');
        const insertGps = async (truckId, tripId, lat, lng) => {
            await client.query(
                `INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, recorded_at)
                 VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 hour' * (random()*48)::int)`,
                [truckId, tripId, lat, lng]
            );
        };

        // Trip 3 running — GPS trail
        await insertGps(truck1, trip3, 13.0827, 80.2707);  // Chennai
        await insertGps(truck1, trip3, 12.8700, 79.1378);  // Vellore
        await insertGps(truck1, trip3, 12.5266, 78.2141);  // Krishnagiri
        console.log('  GPS logs created: 3 entries for running trip');

        // ── 7. MAINTENANCE ──
        console.log('Creating maintenance records...');
        await client.query(
            `INSERT INTO maintenance (truck_id, service_date, description, cost, created_at)
             VALUES ($1, '2026-02-15', 'Oil change and brake service', 15000, NOW() - INTERVAL '22 days')`,
            [truck3]
        );
        await client.query(
            `INSERT INTO maintenance (truck_id, service_date, description, cost, created_at)
             VALUES ($1, '2026-01-20', 'Tyre replacement — all 6 tyres', 48000, NOW() - INTERVAL '48 days')`,
            [truck1]
        );
        await client.query(
            `INSERT INTO maintenance (truck_id, service_date, description, cost, created_at)
             VALUES ($1, '2026-03-01', 'Engine overhaul and clutch plate', 35000, NOW() - INTERVAL '8 days')`,
            [truck3]
        );
        console.log('  Maintenance records created: 3');

        // ── 8. EXPENSES ──
        console.log('Creating expenses...');
        const insertExpense = async (tripId, truckId, cat, amt, desc) => {
            await client.query(
                'INSERT INTO expenses (trip_id, truck_id, category, amount, description) VALUES ($1, $2, $3, $4, $5)',
                [tripId, truckId, cat, amt, desc]
            );
        };

        await insertExpense(trip1, truck1, 'Fuel', 10132, 'Diesel — HP Pump Hosur');
        await insertExpense(trip1, truck1, 'Toll', 1500, 'Bangalore-Chennai toll');
        await insertExpense(trip1, truck1, 'Driver', 2000, 'Driver bata');
        await insertExpense(trip1, truck1, 'Misc', 500, 'Unloading helper');

        await insertExpense(trip2, truck2, 'Fuel', 19595, 'Diesel — multiple stops');
        await insertExpense(trip2, truck2, 'Toll', 4000, 'Hyderabad-Mumbai tolls');
        await insertExpense(trip2, truck2, 'Driver', 3500, 'Driver bata');
        await insertExpense(trip2, truck2, 'Misc', 800, 'Crossing charges');

        await insertExpense(trip3, truck1, 'Fuel', 5362, 'Diesel — top up');
        await insertExpense(trip3, truck1, 'Toll', 800, 'Chennai Outer Ring toll');

        await insertExpense(trip5, truck1, 'Fuel', 3792, 'Diesel — Mysore');
        await insertExpense(trip5, truck1, 'Driver', 1200, 'Driver bata');

        await insertExpense(null, truck3, 'Maintenance', 15000, 'Oil change and brake service');
        await insertExpense(null, truck3, 'Maintenance', 35000, 'Engine overhaul');
        console.log('  Expenses created: 14 entries across trips + maintenance');

        // ── 9. INVOICES ──
        console.log('Creating invoices...');

        // Invoice for trip 1 — Pending
        const sub1 = 45000 + 1500; // base_freight + toll (billable)
        const gst1 = sub1 * 0.05;
        await client.query(
            `INSERT INTO invoices (trip_id, invoice_number, invoice_date, due_date, subtotal, gst_amount, total_amount, payment_status, amount_paid)
             VALUES ($1, 'RKS-INV-2026001', '2026-03-01', '2026-03-15', $2, $3, $4, 'Pending', 0)`,
            [trip1, sub1, gst1, sub1 + gst1]
        );

        // Invoice for trip 2 — Paid
        const sub2 = 85000 + 4000; // base_freight + toll (billable)
        const gst2 = sub2 * 0.12;
        await client.query(
            `INSERT INTO invoices (trip_id, invoice_number, invoice_date, due_date, subtotal, gst_amount, total_amount, payment_status, amount_paid)
             VALUES ($1, 'RKS-INV-2026002', '2026-02-25', '2026-03-10', $2, $3, $4, 'Paid', $4)`,
            [trip2, sub2, gst2, sub2 + gst2]
        );

        // Invoice for trip 5 — Partial
        const sub5 = 22000 + 500;
        const gst5 = sub5 * 0.05;
        const total5 = sub5 + gst5;
        await client.query(
            `INSERT INTO invoices (trip_id, invoice_number, invoice_date, due_date, subtotal, gst_amount, total_amount, payment_status, amount_paid)
             VALUES ($1, 'RKS-INV-2026003', '2026-02-12', '2026-02-26', $2, $3, $4, 'Partial', $5)`,
            [trip5, sub5, gst5, total5, 15000]
        );
        console.log('  Invoices created: 3 (1 Pending, 1 Paid, 1 Partial)');

        // ── 10. NOTIFICATIONS ──
        console.log('Creating notifications...');

        // Notify driver1 about running trip
        await client.query(
            `INSERT INTO notifications (user_id, message, type, related_trip_id, created_at)
             VALUES ($1, $2, 'trip_assigned', $3, NOW() - INTERVAL '2 days')`,
            [driver1UserId, `Trip LR-1003 assigned: Chennai → Bangalore (Freight: ₹40,000)`, trip3]
        );

        // Notify driver2 about planned trip
        await client.query(
            `INSERT INTO notifications (user_id, message, type, related_trip_id, created_at)
             VALUES ($1, $2, 'trip_assigned', $3, NOW() - INTERVAL '1 hour')`,
            [driver2UserId, `Trip LR-1004 assigned: Mumbai → Pune (Freight: ₹15,000)`, trip4]
        );

        // Notify admins about trip1 completion
        await client.query(
            `INSERT INTO notifications (user_id, message, type, related_trip_id, is_read, created_at)
             VALUES ($1, $2, 'trip_completed', $3, true, NOW() - INTERVAL '9 days')`,
            [adminUserId, 'Rajesh Kumar completed Trip LR-1001 (Bangalore → Chennai)', trip1]
        );

        // Notify admins about trip3 start
        await client.query(
            `INSERT INTO notifications (user_id, message, type, related_trip_id, created_at)
             VALUES ($1, $2, 'trip_started', $3, NOW() - INTERVAL '1 day')`,
            [adminUserId, 'Rajesh Kumar started Trip LR-1003 (Chennai → Bangalore)', trip3]
        );

        console.log('  Notifications created: 4');

        console.log('\n=== Seeding completed successfully! ===');
        console.log('Login credentials (password: password123):');
        console.log('  Admin:   admin@rks.com');
        console.log('  Driver1: rajesh@rks.com  (has running trip — fuel form visible)');
        console.log('  Driver2: amit@rks.com    (has planned trip — start button visible)');
        console.log('  Driver3: vijay@rks.com   (available — no active trips)');
        console.log('  Driver4: suresh@rks.com  (available — no active trips)');

    } catch (error) {
        console.error('Seeding failed:', error);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

seed();
