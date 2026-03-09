const pool = require('../config/db');
const bcrypt = require('bcryptjs');

async function seedAllModules() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting Unified Data Seeding for All Modules...\n');

        // Clean up existing data in reverse dependency order
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
            { email: 'admin@gmail.com', password_hash: hashedPassword, role: 'admin', name: 'Gowrishankar R', phone: '9876543210' },
            { email: 'manager@gmail.com', password_hash: hashedPassword, role: 'manager', name: 'Karthik S', phone: '9876543211' },
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
            { truck_number: 'TN-38-BZ-1234', capacity: 16, status: 'Available', insurance_expiry: '2027-06-30', fitness_expiry: '2027-03-15' },
            { truck_number: 'TN-38-CX-5678', capacity: 12, status: 'Available', insurance_expiry: '2027-04-20', fitness_expiry: '2026-12-10' },
            { truck_number: 'TN-30-DY-9012', capacity: 20, status: 'Available', insurance_expiry: '2027-08-15', fitness_expiry: '2027-05-20' },
            { truck_number: 'KA-01-EW-3456', capacity: 10, status: 'Available', insurance_expiry: '2026-11-30', fitness_expiry: '2026-09-25' },
            { truck_number: 'KA-02-FV-7890', capacity: 14, status: 'Available', insurance_expiry: '2027-01-10', fitness_expiry: '2026-10-05' },
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
        const driverUsers = userResults.filter(u => u.role === 'driver');
        const driverResults = [];
        const driverNames = ['Rajesh Kumar', 'Suresh Patel', 'Ramesh Singh', 'Vijay Sharma', 'Anil Verma'];
        const driverPhones = ['9876543212', '9876543213', '9876543214', '9876543215', '9876543216'];

        for (let i = 0; i < driverUsers.length; i++) {
            const res = await client.query(
                'INSERT INTO drivers (user_id, name, phone, license_number, license_expiry, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING driver_id',
                [driverUsers[i].user_id, driverNames[i], driverPhones[i], `TN-DL-2022-${String(i + 1).padStart(4, '0')}`, '2030-06-30', 'Available']
            );
            driverResults.push(res.rows[0]);
        }
        console.log(`✅ Seeded ${driverResults.length} drivers.`);

        // ==================== TRIPS ====================
        console.log('🗺️ Seeding Trips...');
        const tripData = [
            // Completed trips with full charges
            { truck_idx: 0, driver_idx: 0, lr: 'RKS-2026-0001', src: 'Sankari', dst: 'Chennai', empty_km: 15, loaded_km: 340, base: 28000, toll: 1800, toll_bill: true, load: 600, load_bill: false, unload: 800, unload_bill: false, other: 200, other_bill: false, gst: 5, bata: 1500, status: 'Completed', start: '2026-02-01 06:00:00', end: '2026-02-01 18:00:00' },
            { truck_idx: 1, driver_idx: 1, lr: 'RKS-2026-0002', src: 'Salem', dst: 'Bangalore', empty_km: 10, loaded_km: 210, base: 18000, toll: 900, toll_bill: true, load: 400, load_bill: true, unload: 500, unload_bill: true, other: 0, other_bill: false, gst: 5, bata: 1200, status: 'Completed', start: '2026-02-05 05:30:00', end: '2026-02-05 14:00:00' },
            { truck_idx: 2, driver_idx: 2, lr: 'RKS-2026-0003', src: 'Coimbatore', dst: 'Hyderabad', empty_km: 25, loaded_km: 680, base: 52000, toll: 3200, toll_bill: true, load: 800, load_bill: false, unload: 1000, unload_bill: false, other: 500, other_bill: false, gst: 5, bata: 2500, status: 'Completed', start: '2026-02-10 04:00:00', end: '2026-02-11 10:00:00' },
            { truck_idx: 0, driver_idx: 0, lr: 'RKS-2026-0004', src: 'Chennai', dst: 'Mumbai', empty_km: 30, loaded_km: 1330, base: 95000, toll: 5500, toll_bill: true, load: 1200, load_bill: true, unload: 1500, unload_bill: true, other: 800, other_bill: true, gst: 5, bata: 4000, status: 'Completed', start: '2026-02-15 03:00:00', end: '2026-02-17 08:00:00' },
            { truck_idx: 3, driver_idx: 3, lr: 'RKS-2026-0005', src: 'Sankari', dst: 'Erode', empty_km: 5, loaded_km: 55, base: 5500, toll: 200, toll_bill: false, load: 300, load_bill: false, unload: 300, unload_bill: false, other: 0, other_bill: false, gst: 5, bata: 500, status: 'Completed', start: '2026-02-20 08:00:00', end: '2026-02-20 12:00:00' },
            { truck_idx: 1, driver_idx: 1, lr: 'RKS-2026-0006', src: 'Bangalore', dst: 'Kochi', empty_km: 20, loaded_km: 530, base: 42000, toll: 2800, toll_bill: true, load: 700, load_bill: false, unload: 900, unload_bill: false, other: 300, other_bill: false, gst: 5, bata: 2000, status: 'Completed', start: '2026-02-25 05:00:00', end: '2026-02-26 06:00:00' },
            // Running trips
            { truck_idx: 0, driver_idx: 0, lr: 'RKS-2026-0007', src: 'Sankari', dst: 'Delhi', empty_km: 20, loaded_km: 1800, base: 120000, toll: 6000, toll_bill: true, load: 1500, load_bill: true, unload: 0, unload_bill: false, other: 500, other_bill: false, gst: 5, bata: 5000, status: 'Running', start: '2026-03-07 04:00:00', end: null },
            { truck_idx: 2, driver_idx: 2, lr: 'RKS-2026-0008', src: 'Salem', dst: 'Vizag', empty_km: 12, loaded_km: 850, base: 62000, toll: 3500, toll_bill: true, load: 800, load_bill: false, unload: 0, unload_bill: false, other: 0, other_bill: false, gst: 5, bata: 3000, status: 'Running', start: '2026-03-08 06:00:00', end: null },
            // Planned trips
            { truck_idx: 3, driver_idx: 3, lr: 'RKS-2026-0009', src: 'Coimbatore', dst: 'Pune', empty_km: 0, loaded_km: 0, base: 75000, toll: 0, toll_bill: false, load: 0, load_bill: false, unload: 0, unload_bill: false, other: 0, other_bill: false, gst: 5, bata: 3500, status: 'Planned', start: null, end: null },
            { truck_idx: 4, driver_idx: 4, lr: 'RKS-2026-0010', src: 'Sankari', dst: 'Madurai', empty_km: 0, loaded_km: 0, base: 15000, toll: 0, toll_bill: false, load: 0, load_bill: false, unload: 0, unload_bill: false, other: 0, other_bill: false, gst: 5, bata: 800, status: 'Planned', start: null, end: null },
        ];

        const tripResults = [];
        for (const trip of tripData) {
            const res = await client.query(
                `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination, distance_km, empty_km, loaded_km,
                    base_freight, toll_amount, toll_billable, loading_cost, loading_billable, unloading_cost, unloading_billable,
                    other_charges, other_billable, gst_percentage, driver_bata, start_time, end_time, status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING trip_id, status, truck_id, driver_id`,
                [
                    truckResults[trip.truck_idx].truck_id, driverResults[trip.driver_idx].driver_id,
                    trip.lr, trip.src, trip.dst, trip.empty_km + trip.loaded_km, trip.empty_km, trip.loaded_km,
                    trip.base, trip.toll, trip.toll_bill, trip.load, trip.load_bill, trip.unload, trip.unload_bill,
                    trip.other, trip.other_bill, trip.gst, trip.bata, trip.start, trip.end, trip.status
                ]
            );
            tripResults.push(res.rows[0]);

            // Update truck and driver status for Running trips
            if (trip.status === 'Running') {
                await client.query('UPDATE trucks SET status = $1 WHERE truck_id = $2', ['Assigned', res.rows[0].truck_id]);
                await client.query('UPDATE drivers SET status = $1, assigned_truck_id = $2 WHERE driver_id = $3', ['Assigned', res.rows[0].truck_id, res.rows[0].driver_id]);
            }
        }
        console.log(`✅ Seeded ${tripResults.length} trips.`);

        // ==================== FUEL LOGS ====================
        console.log('⛽ Seeding Fuel Logs...');
        const fuelEntries = [
            // Completed trip fuels
            { trip_idx: 0, liters: 80, price: 96.50, date: '2026-02-01 07:30:00' },
            { trip_idx: 0, liters: 65, price: 97.00, date: '2026-02-01 14:00:00' },
            { trip_idx: 1, liters: 55, price: 96.80, date: '2026-02-05 06:00:00' },
            { trip_idx: 2, liters: 120, price: 97.20, date: '2026-02-10 05:30:00' },
            { trip_idx: 2, liters: 95, price: 96.50, date: '2026-02-10 18:00:00' },
            { trip_idx: 3, liters: 200, price: 98.00, date: '2026-02-15 04:00:00' },
            { trip_idx: 3, liters: 180, price: 97.50, date: '2026-02-16 06:00:00' },
            { trip_idx: 3, liters: 120, price: 97.80, date: '2026-02-16 20:00:00' },
            { trip_idx: 4, liters: 20, price: 96.50, date: '2026-02-20 08:30:00' },
            { trip_idx: 5, liters: 100, price: 97.00, date: '2026-02-25 06:00:00' },
            { trip_idx: 5, liters: 85, price: 96.80, date: '2026-02-25 18:00:00' },
            // Running trip fuels
            { trip_idx: 6, liters: 250, price: 98.50, date: '2026-03-07 05:00:00' },
            { trip_idx: 6, liters: 180, price: 98.00, date: '2026-03-08 10:00:00' },
            { trip_idx: 7, liters: 140, price: 97.50, date: '2026-03-08 07:00:00' },
        ];

        for (const fe of fuelEntries) {
            const trip = tripResults[fe.trip_idx];
            await client.query(
                'INSERT INTO fuel_logs (trip_id, liters, price_per_liter, total_cost, created_at) VALUES ($1, $2, $3, $4, $5)',
                [trip.trip_id, fe.liters, fe.price, fe.liters * fe.price, fe.date]
            );
        }
        console.log(`✅ Seeded ${fuelEntries.length} fuel logs.`);

        // ==================== GPS LOGS ====================
        console.log('📍 Seeding GPS Logs...');
        const locations = {
            'Sankari': { lat: 11.4786, lng: 77.8836 },
            'Salem': { lat: 11.6643, lng: 78.1460 },
            'Chennai': { lat: 13.0827, lng: 80.2707 },
            'Bangalore': { lat: 12.9716, lng: 77.5946 },
            'Hyderabad': { lat: 17.3850, lng: 78.4867 },
            'Mumbai': { lat: 19.0760, lng: 72.8777 },
            'Coimbatore': { lat: 11.0168, lng: 76.9558 },
            'Erode': { lat: 11.3410, lng: 77.7172 },
            'Kochi': { lat: 9.9312, lng: 76.2673 },
            'Delhi': { lat: 28.7041, lng: 77.1025 },
            'Vizag': { lat: 17.6868, lng: 83.2185 },
        };

        let gpsCount = 0;
        for (let i = 0; i < tripResults.length; i++) {
            const trip = tripResults[i];
            const data = tripData[i];
            if (data.status === 'Planned') continue;

            const startLoc = locations[data.src] || locations['Sankari'];
            await client.query(
                'INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, recorded_at) VALUES ($1, $2, $3, $4, $5)',
                [trip.truck_id, trip.trip_id, startLoc.lat, startLoc.lng, data.start]
            );
            gpsCount++;

            if (data.status === 'Completed') {
                const endLoc = locations[data.dst] || locations['Chennai'];
                await client.query(
                    'INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, recorded_at) VALUES ($1, $2, $3, $4, $5)',
                    [trip.truck_id, trip.trip_id, endLoc.lat, endLoc.lng, data.end]
                );
                gpsCount++;
            }
        }
        console.log(`✅ Seeded ${gpsCount} GPS logs.`);

        // ==================== MAINTENANCE ====================
        console.log('🔧 Seeding Maintenance Records...');
        const maintenanceData = [
            { truck_idx: 0, date: '2026-01-10', desc: 'Full service - engine oil change, air filter, coolant top-up', cost: 8500 },
            { truck_idx: 0, date: '2026-02-28', desc: 'Brake pad replacement (front axle)', cost: 12000 },
            { truck_idx: 1, date: '2026-01-20', desc: 'Tire rotation and wheel alignment', cost: 6500 },
            { truck_idx: 1, date: '2026-03-01', desc: 'Battery replacement and electrical check', cost: 9500 },
            { truck_idx: 2, date: '2026-01-15', desc: 'Complete servicing + clutch plate adjustment', cost: 15000 },
            { truck_idx: 2, date: '2026-02-20', desc: 'AC compressor repair', cost: 7800 },
            { truck_idx: 3, date: '2026-02-05', desc: 'Suspension spring replacement (rear)', cost: 18000 },
            { truck_idx: 4, date: '2026-01-25', desc: 'Routine maintenance - oil, filters, greasing', cost: 5500 },
            { truck_idx: 4, date: '2026-03-05', desc: 'Radiator repair and hose replacement', cost: 11000 },
        ];

        for (const m of maintenanceData) {
            await client.query(
                'INSERT INTO maintenance (truck_id, service_date, description, cost, created_at) VALUES ($1, $2, $3, $4, $5)',
                [truckResults[m.truck_idx].truck_id, m.date, m.desc, m.cost, m.date + ' 10:00:00']
            );
        }
        console.log(`✅ Seeded ${maintenanceData.length} maintenance records.`);

        // ==================== EXPENSES ====================
        console.log('💸 Seeding Expenses...');
        const expenseData = [
            { trip_idx: 0, truck_idx: 0, cat: 'Fuel', amount: 14002, desc: 'Diesel for Sankari-Chennai trip', date: '2026-02-01' },
            { trip_idx: 0, truck_idx: 0, cat: 'Toll', amount: 1800, desc: 'Highway toll charges', date: '2026-02-01' },
            { trip_idx: 0, truck_idx: 0, cat: 'Driver', amount: 1500, desc: 'Driver bata for Sankari-Chennai', date: '2026-02-01' },
            { trip_idx: 1, truck_idx: 1, cat: 'Fuel', amount: 5324, desc: 'Diesel for Salem-Bangalore trip', date: '2026-02-05' },
            { trip_idx: 1, truck_idx: 1, cat: 'Toll', amount: 900, desc: 'NH toll (Salem to Bangalore)', date: '2026-02-05' },
            { trip_idx: 2, truck_idx: 2, cat: 'Fuel', amount: 20862, desc: 'Diesel for Coimbatore-Hyderabad', date: '2026-02-10' },
            { trip_idx: 2, truck_idx: 2, cat: 'Toll', amount: 3200, desc: 'Multi-state highway tolls', date: '2026-02-10' },
            { trip_idx: 3, truck_idx: 0, cat: 'Fuel', amount: 48770, desc: 'Diesel for Chennai-Mumbai long haul', date: '2026-02-15' },
            { trip_idx: 3, truck_idx: 0, cat: 'Toll', amount: 5500, desc: 'Chennai-Mumbai highway tolls', date: '2026-02-15' },
            { trip_idx: 3, truck_idx: 0, cat: 'Driver', amount: 4000, desc: 'Driver bata for long haul', date: '2026-02-16' },
            { trip_idx: null, truck_idx: 0, cat: 'Maintenance', amount: 8500, desc: 'Full service - TN-38-BZ-1234', date: '2026-01-10' },
            { trip_idx: null, truck_idx: 1, cat: 'Maintenance', amount: 6500, desc: 'Tire rotation - TN-38-CX-5678', date: '2026-01-20' },
            { trip_idx: null, truck_idx: 2, cat: 'Maintenance', amount: 15000, desc: 'Complete servicing - TN-30-DY-9012', date: '2026-01-15' },
            { trip_idx: null, truck_idx: 3, cat: 'Insurance', amount: 35000, desc: 'Annual premium for KA-01-EW-3456', date: '2026-01-01' },
            { trip_idx: null, truck_idx: 4, cat: 'Insurance', amount: 32000, desc: 'Annual premium for KA-02-FV-7890', date: '2026-01-01' },
            { trip_idx: null, truck_idx: 0, cat: 'RTO', amount: 4500, desc: 'Fitness certificate renewal', date: '2026-02-10' },
            { trip_idx: null, truck_idx: 1, cat: 'RTO', amount: 4500, desc: 'Fitness certificate renewal', date: '2026-02-12' },
            { trip_idx: null, truck_idx: null, cat: 'Misc', amount: 2500, desc: 'Office stationery and printing', date: '2026-01-15' },
            { trip_idx: null, truck_idx: null, cat: 'Misc', amount: 8000, desc: 'GPS tracker subscription (quarterly)', date: '2026-01-01' },
            { trip_idx: 5, truck_idx: 1, cat: 'Fuel', amount: 17955, desc: 'Diesel for Bangalore-Kochi trip', date: '2026-02-25' },
            { trip_idx: 5, truck_idx: 1, cat: 'Toll', amount: 2800, desc: 'Bangalore-Kochi highway tolls', date: '2026-02-25' },
        ];

        for (const exp of expenseData) {
            const tripId = exp.trip_idx !== null ? tripResults[exp.trip_idx].trip_id : null;
            const truckId = exp.truck_idx !== null ? truckResults[exp.truck_idx].truck_id : null;
            await client.query(
                'INSERT INTO expenses (trip_id, truck_id, category, amount, description, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
                [tripId, truckId, exp.cat, exp.amount, exp.desc, exp.date + ' 12:00:00']
            );
        }
        console.log(`✅ Seeded ${expenseData.length} expenses.`);

        // ==================== INVOICES ====================
        console.log('🧾 Seeding Invoices...');
        const invoiceData = [
            // Trip 0: Sankari→Chennai, base=28000, billable toll=1800, subtotal=29800, GST 5%
            { trip_idx: 0, inv_num: 'RKS-INV-20260201-001', inv_date: '2026-02-02', due_date: '2026-02-16', status: 'Paid' },
            // Trip 1: Salem→Bangalore, base=18000, billable toll+load+unload=1800, subtotal=19800, GST 5%
            { trip_idx: 1, inv_num: 'RKS-INV-20260205-002', inv_date: '2026-02-06', due_date: '2026-02-20', status: 'Paid' },
            // Trip 2: Coimbatore→Hyderabad, base=52000, billable toll=3200, subtotal=55200, GST 5%
            { trip_idx: 2, inv_num: 'RKS-INV-20260211-003', inv_date: '2026-02-12', due_date: '2026-02-26', status: 'Partial' },
            // Trip 3: Chennai→Mumbai, base=95000, billable toll+load+unload+other=9000, subtotal=104000, GST 5%
            { trip_idx: 3, inv_num: 'RKS-INV-20260217-004', inv_date: '2026-02-18', due_date: '2026-03-04', status: 'Pending' },
            // Trip 4: Sankari→Erode, base=5500, no billable extras, subtotal=5500, GST 5%
            { trip_idx: 4, inv_num: 'RKS-INV-20260220-005', inv_date: '2026-02-21', due_date: '2026-03-07', status: 'Paid' },
            // Trip 5: Bangalore→Kochi, base=42000, billable toll=2800, subtotal=44800, GST 5%
            { trip_idx: 5, inv_num: 'RKS-INV-20260226-006', inv_date: '2026-02-27', due_date: '2026-03-13', status: 'Partial' },
        ];

        for (const inv of invoiceData) {
            const trip = tripData[inv.trip_idx];
            // Calculate billable subtotal
            let subtotal = trip.base;
            if (trip.toll_bill) subtotal += trip.toll;
            if (trip.load_bill) subtotal += trip.load;
            if (trip.unload_bill) subtotal += trip.unload;
            if (trip.other_bill) subtotal += trip.other;

            const gst_amount = subtotal * (trip.gst / 100);
            const total = subtotal + gst_amount;

            let amount_paid = 0;
            if (inv.status === 'Paid') amount_paid = total;
            else if (inv.status === 'Partial') amount_paid = Math.round(total * 0.6); // 60% paid

            await client.query(
                `INSERT INTO invoices (trip_id, invoice_number, invoice_date, due_date, subtotal, gst_amount, total_amount, payment_status, amount_paid, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [tripResults[inv.trip_idx].trip_id, inv.inv_num, inv.inv_date, inv.due_date, subtotal, gst_amount, total, inv.status, amount_paid, inv.inv_date + ' 10:00:00']
            );
        }
        console.log(`✅ Seeded ${invoiceData.length} invoices.`);

        console.log('\n✨ Unified Data Seeding completed successfully!\n');
        console.log('📋 Summary:');
        console.log(`   Users: ${userResults.length}`);
        console.log(`   Trucks: ${truckResults.length}`);
        console.log(`   Drivers: ${driverResults.length}`);
        console.log(`   Trips: ${tripResults.length} (${tripData.filter(t => t.status === 'Completed').length} completed, ${tripData.filter(t => t.status === 'Running').length} running, ${tripData.filter(t => t.status === 'Planned').length} planned)`);
        console.log(`   Fuel Logs: ${fuelEntries.length}`);
        console.log(`   GPS Logs: ${gpsCount}`);
        console.log(`   Maintenance: ${maintenanceData.length}`);
        console.log(`   Expenses: ${expenseData.length}`);
        console.log(`   Invoices: ${invoiceData.length}`);
        console.log('\n🔑 Login: admin@gmail.com / 1234');

    } catch (err) {
        console.error('❌ Seeding failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

seedAllModules();
