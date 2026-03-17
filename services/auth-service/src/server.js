require('dotenv').config();

const bcrypt = require('bcryptjs');
const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3201);
const JWT_SECRET = process.env.JWT_SECRET || 'replace_this_secret';

app.use(express.json());

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            user_id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(30) NOT NULL CHECK(role IN ('admin', 'manager', 'driver', 'customer')),
            name VARCHAR(120) NOT NULL,
            phone VARCHAR(20),
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS customers (
            customer_id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE REFERENCES users(user_id) ON DELETE SET NULL,
            name VARCHAR(120),
            contact_number VARCHAR(20) UNIQUE,
            email VARCHAR(255) UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            notification_id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
            message TEXT NOT NULL,
            type VARCHAR(50) NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            related_trip_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)');
}

async function seedDefaultUsers() {
    const result = await pool.query('SELECT COUNT(*) FROM users');
    if (Number(result.rows[0].count) > 0) return;

    console.log('auth-service: No users found, seeding default users...');
    const hash = await bcrypt.hash('password123', 10);

    await pool.query(
        `INSERT INTO users (email, password_hash, role, name, phone) VALUES
            ($1, $2, 'admin',    'Admin User',   '9876543210'),
            ($3, $2, 'manager',  'Manager User', '9876543211'),
            ($4, $2, 'driver',   'Rajesh Kumar', '9876543212'),
            ($5, $2, 'driver',   'Suresh Singh', '9876543213'),
            ($6, $2, 'driver',   'Amit Patel',   '9876543214'),
            ($7, $2, 'customer', 'Test Customer','9876543215')
        ON CONFLICT (email) DO NOTHING`,
        [
            'admin@example.com', hash,
            'manager@example.com',
            'driver1@example.com',
            'driver2@example.com',
            'driver3@example.com',
            'test@example.com'
        ]
    );

    console.log('auth-service: Default users seeded successfully');
}

function signToken(user) {
    return jwt.sign(
        {
            user_id: user.user_id,
            role: user.role,
            email: user.email,
            name: user.name
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function readBearerToken(req) {
    const raw = req.headers.authorization || '';
    const [prefix, token] = raw.split(' ');
    if (prefix !== 'Bearer' || !token) {
        return null;
    }
    return token;
}

function decodeToken(req) {
    const token = readBearerToken(req);
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({ status: 'OK', service: 'auth-service', timestamp: new Date().toISOString() });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.post('/auth/register', async (req, res) => {
    const { email, password, name, phone = null, role = 'customer' } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: 'email, password and name are required' });
    }

    const normalizedRole = String(role).toLowerCase();
    const allowedRoles = new Set(['admin', 'manager', 'driver', 'customer']);
    if (!allowedRoles.has(normalizedRole)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    try {
        const exists = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (exists.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const insertUser = await pool.query(
            `INSERT INTO users (email, password_hash, role, name, phone)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING user_id, email, role, name, phone, created_at`,
            [email, passwordHash, normalizedRole, name, phone]
        );

        const user = insertUser.rows[0];

        if (user.role === 'customer') {
            await pool.query(
                `INSERT INTO customers (user_id, name, contact_number, email)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id) DO NOTHING`,
                [user.user_id, user.name, user.phone, user.email]
            );
        }

        return res.status(201).json({
            success: true,
            data: user,
            token: signToken(user)
        });
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
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = userResult.rows[0];

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        return res.json({
            success: true,
            token: signToken(user),
            user: {
                user_id: user.user_id,
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

app.get('/auth/me', async (req, res) => {
    try {
        const token = readBearerToken(req);
        if (!token) {
            return res.status(401).json({ success: false, message: 'Missing Bearer token' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const userResult = await pool.query(
            'SELECT user_id, email, role, name, phone, created_at FROM users WHERE user_id = $1',
            [decoded.user_id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.json({ success: true, data: userResult.rows[0] });
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
});

// ========== NOTIFICATIONS ==========

app.get('/notifications', async (req, res) => {
    try {
        const decoded = decodeToken(req);
        const userId = decoded?.user_id || null;

        let result;
        if (userId) {
            result = await pool.query(
                'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
                [userId]
            );
        } else {
            result = await pool.query(
                'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50'
            );
        }

        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/notifications/read-all', async (req, res) => {
    try {
        const decoded = decodeToken(req);
        const userId = decoded?.user_id || null;

        if (userId) {
            await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [userId]);
        } else {
            await pool.query('UPDATE notifications SET is_read = true');
        }

        return res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(() => seedDefaultUsers())
    .then(() => {
        app.listen(PORT, () => {
            console.log(`auth-service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('auth-service startup failed:', error);
        process.exit(1);
    });
