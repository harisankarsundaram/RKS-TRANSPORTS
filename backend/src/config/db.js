const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let dbInstance = null;

async function getDb() {
    if (dbInstance) return dbInstance;
    dbInstance = await open({
        filename: path.join(__dirname, '../../database.sqlite'),
        driver: sqlite3.Database
    });
    // Enable foreign keys
    await dbInstance.run('PRAGMA foreign_keys = ON');
    return dbInstance;
}

const pool = {
    query: async (sql, params) => {
        const db = await getDb();
        try {
            // Check if it's SELECT
            if (sql.trim().toUpperCase().startsWith('SELECT')) {
                const rows = await db.all(sql, params);
                return [rows, []]; // Return compatible [rows, fields] format
            } else {
                const result = await db.run(sql, params);
                // Return compatible [result] format
                // mysql2 result has: insertId, affectedRows
                return [{
                    insertId: result.lastID,
                    affectedRows: result.changes
                }, []];
            }
        } catch (error) {
            console.error('SQL Error:', error.message, 'SQL:', sql);
            throw error;
        }
    },
    execute: async (sql, params) => {
        return pool.query(sql, params);
    },
    getConnection: async () => {
        // Return a mock connection object that uses the shared pool
        return {
            release: () => { },
            beginTransaction: async () => { /* No-op for now */ },
            commit: async () => { /* No-op */ },
            rollback: async () => { /* No-op */ },
            query: async (s, p) => pool.query(s, p),
            execute: async (s, p) => pool.query(s, p)
        }
    },
    end: async () => { if (dbInstance) await dbInstance.close(); }
};

// Test connection
getDb()
    .then(() => {
        console.log('SQLite Database connected successfully');
    })
    .catch(err => {
        console.error('SQLite Database connection failed:', err.message);
    });

module.exports = pool;
