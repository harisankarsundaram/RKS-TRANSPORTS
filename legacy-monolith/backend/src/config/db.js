const { Pool } = require('pg');
require('dotenv').config();

// Configuration for PostgreSQL connection pool
const isLocal = process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : {
        rejectUnauthorized: false // Required for NeonDB
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000, // Increased to 30s for NeonDB wake-up
});

// Robust Test connection with retries
const connectWithRetry = async (attempts = 5) => {
    for (let i = 0; i < attempts; i++) {
        try {
            await pool.query('SELECT NOW()');
            console.log('✅ PostgreSQL Database connected successfully');
            return;
        } catch (err) {
            console.error(`⚠️ Database connection attempt ${i + 1} failed:`, err.message);
            if (i === attempts - 1) {
                console.error('❌ Maximum connection attempts reached. Server will start but DB might be unavailable.');
            } else {
                const delay = Math.pow(2, i) * 1000;
                console.log(`Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
};

connectWithRetry();

// Handle pool errors
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

module.exports = pool;
