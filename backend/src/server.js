require('dotenv').config();
const app = require('./app');
const initDatabase = require('./config/initDb');

const PORT = process.env.PORT || 3000;

// Initialize database and start server
async function startServer() {
    console.log('Initializing database...');
    await initDatabase();

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/health`);
        console.log(`API Base URL: http://localhost:${PORT}/api`);
    });
}

startServer();
