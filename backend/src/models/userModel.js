const pool = require('../config/db');

const UserModel = {
    // Create new user
    async create(userData) {
        const { email, password_hash, role, name, phone } = userData;
        const [result] = await pool.execute(
            `INSERT INTO users (email, password_hash, role, name, phone) 
             VALUES (?, ?, ?, ?, ?)`,
            [email, password_hash, role, name, phone]
        );
        return { user_id: result.insertId, ...userData };
    },

    // Find user by email
    async findByEmail(email) {
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return rows[0] || null;
    },

    // Find user by ID
    async findById(id) {
        const [rows] = await pool.execute(
            'SELECT user_id, email, role, name, phone, created_at FROM users WHERE user_id = ?',
            [id]
        );
        return rows[0] || null;
    }
};

module.exports = UserModel;
