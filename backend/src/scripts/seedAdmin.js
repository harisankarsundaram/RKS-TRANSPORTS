const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedAdmin() {
    try {
        console.log('Seeding admin user...');

        const email = 'admin@gmail.com';
        const password = '1234';
        const role = 'admin';
        const name = 'System Admin';
        const phone = '0000000000';

        // Check if exists
        const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows && existing.rows.length > 0) {
            console.log('Admin user already exists.');
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        await pool.query(
            `INSERT INTO users (email, password_hash, role, name, phone) 
             VALUES ($1, $2, $3, $4, $5)`,
            [email, password_hash, role, name, phone]
        );

        console.log('✅ Admin user created successfully: admin@gmail.com / 1234');

    } catch (error) {
        console.error('Error seeding admin:', error);
    } finally {
        await pool.end();
    }
}

seedAdmin();
