const initDatabase = require('../config/initDb');

async function runInit() {
    console.log('🚀 Starting database initialization...');
    const success = await initDatabase();

    if (success) {
        console.log('✅ Database initialization completed successfully');
        process.exit(0);
    } else {
        console.error('❌ Database initialization failed');
        process.exit(1);
    }
}

runInit();
