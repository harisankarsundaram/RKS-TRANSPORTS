require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3101;
const JWT_SECRET = process.env.JWT_SECRET || 'replace_this_with_strong_secret';

app.use(cors());
app.use(express.json());

async function ensureUsersTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            user_id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL CHECK(role IN ('admin', 'driver', 'manager', 'customer')),
            name VARCHAR(100) NOT NULL,
            phone VARCHAR(20),
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', service: 'auth-service', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', service: 'auth-service', message: error.message });
    }
});

app.post('/auth/register', async (req, res) => {
    const { email, password, name, phone, role = 'customer' } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: 'email, password and name are required' });
    }

    const allowedRoles = new Set(['admin', 'driver', 'manager', 'customer']);
    if (!allowedRoles.has(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    try {
        const existing = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        const inserted = await pool.query(
            `INSERT INTO users (email, password_hash, role, name, phone)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING user_id, email, role, name, phone, created_at`,
            [email, password_hash, role, name, phone || null]
        );

        return res.status(201).json({ success: true, data: inserted.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'email and password are required' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.user_id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

        return res.json({
            success: true,
            token,
            user: {
                id: user.user_id,
                email: user.email,
                role: user.role,
                name: user.name,
                phone: user.phone
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureUsersTable()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`auth-service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('auth-service startup failed:', error);
        process.exit(1);
    });
