const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedAdmin() {
    try {
        console.log('Seeding admin user...');

        const email = 'admin@gmail.com';
        const password = '1234';
        const role = 'admin';
        const name = 'System Admin'; // Or "RKS Owner"
        const phone = '0000000000';

        // Check if exists
        const [existing] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (existing && existing.length > 0) {
            console.log('Admin user already exists.');
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        await pool.execute(
            `INSERT INTO users (email, password_hash, role, name, phone) 
             VALUES (?, ?, ?, ?, ?)`,
            [email, password_hash, role, name, phone]
        );

        console.log('Admin user created successfully: admin@gmail.com / 1234');

    } catch (error) {
        console.error('Error seeding admin:', error);
    } finally {
        // Just log, don't close pool if used largely, but here it's fine script
        // Actually best not to close if require'd db.js pool handles generic connection logic
        // But for a script we might want to exit.
        // db.js doesn't export a clean close for the pool wrapper easily unless we call end().
        await pool.end();
    }
}

seedAdmin();
