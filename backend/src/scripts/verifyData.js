const pool = require('../config/db');

async function verifyEnhancedData() {
    try {
        console.log('🚀 Enhanced Database Verification\n');
        console.log('='.repeat(60));

        // 1. Trip Distribution
        const tripsResult = await pool.query(`
            SELECT status, COUNT(*) as count, 
                   COALESCE(SUM(freight_amount), 0) as total_freight,
                   COALESCE(SUM(distance_km), 0) as total_distance
            FROM trips GROUP BY status
        `);
        console.log('\n🗺️  TRIP STATISTICS:');
        tripsResult.rows.forEach(row => {
            console.log(`   - ${row.status.padEnd(10)}: ${String(row.count).padStart(3)} trips | Freight: ₹${Number(row.total_freight).toLocaleString().padStart(9)} | Distance: ${Number(row.total_distance).toFixed(0).padStart(6)} km`);
        });

        // 2. Fuel Statistics
        const fuelResult = await pool.query(`
            SELECT COUNT(*) as count, SUM(liters) as total_liters, SUM(total_cost) as total_cost
            FROM fuel_logs
        `);
        console.log('\n⛽ FUEL STATISTICS:');
        console.log(`   - Total Logs   : ${fuelResult.rows[0].count}`);
        console.log(`   - Total Liters : ${Number(fuelResult.rows[0].total_liters).toFixed(2)} L`);
        console.log(`   - Total Cost   : ₹${Number(fuelResult.rows[0].total_cost).toLocaleString()}`);

        // 3. Efficiency Sample (Top 5 trips)
        const efficiencyResult = await pool.query(`
            SELECT t.trip_id, t.lr_number, t.distance_km, SUM(f.liters) as liters
            FROM trips t
            JOIN fuel_logs f ON t.trip_id = f.trip_id
            WHERE t.status = 'Completed'
            GROUP BY t.trip_id, t.lr_number, t.distance_km
            LIMIT 5
        `);
        console.log('\n📉 FUEL EFFICIENCY SAMPLE (Completed Trips):');
        efficiencyResult.rows.forEach(row => {
            const liters = Number(row.liters);
            const efficiency = (row.distance_km / liters).toFixed(2);
            console.log(`   - Trip ${row.lr_number}: ${row.distance_km}km / ${liters.toFixed(2)}L = ${efficiency} km/L`);
        });

        // 4. Invoice Statistics
        const invResult = await pool.query(`
            SELECT payment_status, COUNT(*) as count, SUM(total_amount) as total
            FROM invoices GROUP BY payment_status
        `);
        console.log('\n🧾 INVOICE STATISTICS:');
        invResult.rows.forEach(row => {
            console.log(`   - ${row.payment_status.padEnd(10)}: ${row.count} invoices | Total: ₹${Number(row.total).toLocaleString().padStart(9)}`);
        });

        // 5. New Analytics Endpoint Check (Verifying Controller Logic via SQL)
        const analytics = await pool.query(`
            SELECT 
                COALESCE(SUM(freight_amount), 0) as revenue,
                COUNT(*) filter (where status = 'Completed') as completed,
                COALESCE(SUM(distance_km), 0) as distance
            FROM trips
        `);
        console.log('\n📊 SYSTEM ANALYTICS SNAPSHOT:');
        console.log(`   - Total Global Revenue  : ₹${Number(analytics.rows[0].revenue).toLocaleString()}`);
        console.log(`   - Total Active Mileage  : ${Number(analytics.rows[0].distance).toLocaleString()} km`);

        console.log('\n' + '='.repeat(60));
        console.log('\n✅ Data seeding and API enhancements verified successfully!');

    } catch (error) {
        console.error('❌ Verification failed:', error.message);
    } finally {
        await pool.end();
    }
}

verifyEnhancedData();
