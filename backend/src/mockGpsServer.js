require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mockTrackingRoutes = require('./routes/mockTrackingRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.MOCK_GPS_PORT || 4001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
    res.json({ status: 'OK', mode: 'mock-gps', timestamp: new Date().toISOString() });
});

app.use('/api', mockTrackingRoutes);

app.use(errorHandler);

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint not found' });
});

app.listen(PORT, () => {
    console.log(`Mock GPS server running on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`Mock API base: http://localhost:${PORT}/api`);
});
