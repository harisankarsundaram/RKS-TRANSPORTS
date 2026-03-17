const pool = require('../config/db');

const UserModel = {
    // Create new user
    async create(userData) {
        const { email, password_hash, role, name, phone } = userData;
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, role, name, phone) 
             VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
            [email, password_hash, role, name, phone]
        );
        return { user_id: result.rows[0].user_id, ...userData };
    },

    // Find user by email
    async findByEmail(email) {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows[0] || null;
    },

    // Find user by ID
    async findById(id) {
        const result = await pool.query(
            'SELECT user_id, email, role, name, phone, created_at FROM users WHERE user_id = $1',
            [id]
        );
        return result.rows[0] || null;
    }
};

module.exports = UserModel;
