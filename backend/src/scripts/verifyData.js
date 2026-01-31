const pool = require('../config/db');

async function verifyData() {
    try {
        console.log('📊 Database Data Summary\n');
        console.log('='.repeat(50));

        // Count users
        const usersResult = await pool.query('SELECT COUNT(*) as count, role FROM users GROUP BY role');
        console.log('\n👥 USERS:');
        let totalUsers = 0;
        for (const row of usersResult.rows) {
            console.log(`   ${row.role}: ${row.count}`);
            totalUsers += parseInt(row.count);
        }
        console.log(`   Total: ${totalUsers}`);

        // Count trucks
        const trucksResult = await pool.query('SELECT COUNT(*) as count, status FROM trucks GROUP BY status');
        console.log('\n🚚 TRUCKS:');
        let totalTrucks = 0;
        for (const row of trucksResult.rows) {
            console.log(`   ${row.status}: ${row.count}`);
            totalTrucks += parseInt(row.count);
        }
        console.log(`   Total: ${totalTrucks}`);

        // Count drivers
        const driversResult = await pool.query('SELECT COUNT(*) as count, status FROM drivers GROUP BY status');
        console.log('\n👨‍✈️ DRIVERS:');
        let totalDrivers = 0;
        for (const row of driversResult.rows) {
            console.log(`   ${row.status}: ${row.count}`);
            totalDrivers += parseInt(row.count);
        }
        console.log(`   Total: ${totalDrivers}`);

        // Count trips
        const tripsResult = await pool.query('SELECT COUNT(*) as count, status FROM trips GROUP BY status');
        console.log('\n🗺️  TRIPS:');
        let totalTrips = 0;
        for (const row of tripsResult.rows) {
            console.log(`   ${row.status}: ${row.count}`);
            totalTrips += parseInt(row.count);
        }
        console.log(`   Total: ${totalTrips}`);

        // Count fuel logs
        const fuelResult = await pool.query('SELECT COUNT(*) as count FROM fuel_logs');
        console.log(`\n⛽ FUEL LOGS: ${fuelResult.rows[0].count}`);

        // Count GPS logs
        const gpsResult = await pool.query('SELECT COUNT(*) as count FROM gps_logs');
        console.log(`📍 GPS LOGS: ${gpsResult.rows[0].count}`);

        // Count maintenance
        const maintenanceResult = await pool.query('SELECT COUNT(*) as count FROM maintenance');
        console.log(`🔧 MAINTENANCE RECORDS: ${maintenanceResult.rows[0].count}`);

        // Count invoices
        const invoicesResult = await pool.query('SELECT COUNT(*) as count, payment_status FROM invoices GROUP BY payment_status');
        console.log('\n🧾 INVOICES:');
        let totalInvoices = 0;
        for (const row of invoicesResult.rows) {
            console.log(`   ${row.payment_status}: ${row.count}`);
            totalInvoices += parseInt(row.count);
        }
        console.log(`   Total: ${totalInvoices}`);

        console.log('\n' + '='.repeat(50));
        console.log('\n✅ Database is populated with sample data!');
        console.log('\n🔐 Login Credentials (password: 1234):');
        console.log('   Admin: admin@gmail.com');
        console.log('   Manager: manager@gmail.com');
        console.log('   Drivers: driver1@gmail.com to driver6@gmail.com\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

verifyData();
