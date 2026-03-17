const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/logistics_platform';
const connectionHost = (() => {
    try {
        return new URL(connectionString).hostname;
    } catch {
        return '';
    }
})();
const isLocal = ['localhost', '127.0.0.1', 'postgres'].includes(connectionHost);

const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false }
});

module.exports = pool;
