const express = require('express');
const cors = require('cors');
const truckRoutes = require('./routes/truckRoutes');
const driverRoutes = require('./routes/driverRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const tripRoutes = require('./routes/tripRoutes');
const gpsRoutes = require('./routes/gpsRoutes');
const fuelRoutes = require('./routes/fuelRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const authRoutes = require('./routes/authRoutes');


const errorHandler = require('./middleware/errorHandler');

const app = express();

// CORS middleware
app.use(cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/trucks', truckRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/fuel', fuelRoutes);
app.use('/api/gps', gpsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api', assignmentRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Error handler middleware
app.use(errorHandler);

module.exports = app;
