const pool = require('../config/db');
const bcrypt = require('bcryptjs');

async function seedEnhancedData() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting Enhanced Data Seeding (For Every User)...');

        // 1. Get all users and trucks
        const users = (await client.query('SELECT user_id, name, role FROM users')).rows;
        const trucks = (await client.query('SELECT truck_id, capacity FROM trucks')).rows;

        console.log(`📊 Found ${users.length} users and ${trucks.length} trucks.`);

        // 2. Ensure EVERY user has a driver record (so they can see "My Trips")
        console.log('🛠️ Synchronizing driver records for all users...');
        for (const user of users) {
            const existingDriver = await client.query('SELECT driver_id FROM drivers WHERE user_id = $1', [user.user_id]);
            if (existingDriver.rows.length === 0) {
                console.log(`   + Creating driver record for ${user.name} (${user.role})`);
                await client.query(
                    'INSERT INTO drivers (user_id, name, phone, license_number, license_expiry, status) VALUES ($1, $2, $3, $4, $5, $6)',
                    [user.user_id, user.name, '9988776655', `LIC-${user.user_id}`, '2030-01-01', 'Available']
                );
            }
        }

        const drivers = (await client.query('SELECT driver_id, name FROM drivers')).rows;
        console.log(`✅ Now have ${drivers.length} drivers prepared.`);

        // 3. Define Route Library
        const routes = [
            { source: 'Chennai', destination: 'Bangalore', distance: 350 },
            { source: 'Bangalore', destination: 'Hyderabad', distance: 570 },
            { source: 'Hyderabad', destination: 'Mumbai', distance: 710 },
            { source: 'Mumbai', destination: 'Pune', distance: 150 },
            { source: 'Delhi', destination: 'Jaipur', distance: 280 },
            { source: 'Kolkata', destination: 'Bhubaneswar', distance: 440 },
            { source: 'Ahmedabad', destination: 'Surat', distance: 260 },
            { source: 'Coimbatore', destination: 'Chennai', distance: 500 }
        ];

        const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const getRandomInRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

        console.log('🧹 Cleaning up old logs...');
        await client.query('DELETE FROM fuel_logs');
        await client.query('DELETE FROM gps_logs');
        await client.query('DELETE FROM invoices');
        await client.query('DELETE FROM trips');

        const tripIds = [];
        // Generate enough trips per driver
        const tripCount = drivers.length * 8; // At least 8 trips per user

        console.log(`🏗️ Generating ${tripCount} trips across ${drivers.length} users...`);

        let currentTripIdx = 1;
        for (const driver of drivers) {
            console.log(`   Generate logs for user: ${driver.name}...`);
            // Give each driver at least 8 trips
            for (let j = 0; j < 8; j++) {
                const truck = getRandom(trucks);
                const route = getRandom(routes);
                const distance = route.distance + getRandomInRange(-20, 20);
                const freight = distance * getRandomInRange(45, 55);
                const lr_number = `LR24-${String(currentTripIdx).padStart(4, '0')}`;

                let status = 'Completed';
                if (j === 6) status = 'Running';
                if (j === 7) status = 'Planned';

                const month = getRandomInRange(0, 2);
                const day = getRandomInRange(1, 28);
                const start_time = new Date(2024, month, day, getRandomInRange(6, 12), 0, 0);

                let end_time = null;
                if (status === 'Completed') {
                    const durationHours = Math.ceil(distance / 45) + getRandomInRange(1, 4);
                    end_time = new Date(start_time.getTime() + durationHours * 60 * 60 * 1000);
                }

                const tripRes = await client.query(
                    `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination, distance_km, freight_amount, start_time, end_time, status, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING trip_id`,
                    [truck.truck_id, driver.driver_id, lr_number, route.source, route.destination, distance, freight,
                        start_time, end_time, status, start_time]
                );

                // Update Truck/Driver status if trip is running
                if (status === 'Running') {
                    await client.query('UPDATE trucks SET status = $1 WHERE truck_id = $2', ['Assigned', truck.truck_id]);
                    await client.query('UPDATE drivers SET status = $1, assigned_truck_id = $2 WHERE driver_id = $3', ['Assigned', truck.truck_id, driver.driver_id]);
                }

                const trip_id = tripRes.rows[0].trip_id;
                tripIds.push({ id: trip_id, status, distance });
                currentTripIdx++;
            }
        }

        console.log('⛽ Logging fuel for every completed and running trip...');
        let fuelEntryCount = 0;

        for (const trip of tripIds) {
            if (trip.status === 'Planned') continue;

            const stops = Math.max(1, Math.ceil(trip.distance / 300));
            const totalLitersRequired = trip.distance / getRandomInRange(3.5, 4.5);
            const litersPerStop = totalLitersRequired / stops;

            for (let s = 1; s <= stops; s++) {
                const liters = Number((litersPerStop + getRandomInRange(-2, 2)).toFixed(2));
                const price = Number((96 + Math.random() * 4).toFixed(2));
                const cost = Number((liters * price).toFixed(2));

                await client.query(
                    'INSERT INTO fuel_logs (trip_id, liters, price_per_liter, total_cost, created_at) VALUES ($1, $2, $3, $4, NOW())',
                    [trip.id, liters, price, cost]
                );
                fuelEntryCount++;
            }
        }

        console.log(`✅ Generated ${fuelEntryCount} fuel logs.`);

        console.log('\n✨ Every user now has trips and fuel logs!');
        console.log('--------------------------------------------------');
        console.log(`Total Trips: ${tripIds.length}`);
        console.log(`Total Fuel Logs: ${fuelEntryCount}`);
        console.log('--------------------------------------------------');

    } catch (err) {
        console.error('❌ Seeding failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

seedEnhancedData();
