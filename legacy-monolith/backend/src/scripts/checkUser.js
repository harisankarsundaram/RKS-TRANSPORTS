const pool = require('../config/db');

async function checkUsers() {
    try {
        const [users] = await pool.query('SELECT email, role, name FROM users');
        console.log('All Users (Email/Role):', JSON.stringify(users, null, 2));
    } catch (err) {
        console.error(err);
    }
}
checkUsers();
