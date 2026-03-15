require('dotenv').config();

const cors = require('cors');
const express = require('express');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = Number(process.env.PORT || 3200);

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3201';
const FLEET_SERVICE_URL = process.env.FLEET_SERVICE_URL || 'http://localhost:3202';
const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || 'http://localhost:3203';
const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:3204';
const TRACKING_SERVICE_URL = process.env.TRACKING_SERVICE_URL || 'http://localhost:3205';
const MOCK_GPS_SERVICE_URL = process.env.MOCK_GPS_SERVICE_URL || 'http://localhost:3206';
const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3207';
const ALERT_SERVICE_URL = process.env.ALERT_SERVICE_URL || 'http://localhost:3208';
const OPTIMIZATION_SERVICE_URL = process.env.OPTIMIZATION_SERVICE_URL || 'http://localhost:3209';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'api-gateway',
        timestamp: new Date().toISOString()
    });
});

function proxyRoute(basePath, target, rewriteMap) {
    app.use(
        basePath,
        createProxyMiddleware({
            target,
            changeOrigin: true,
            pathRewrite: rewriteMap,
            onError(error, req, res) {
                res.status(502).json({
                    success: false,
                    message: `Gateway proxy error for ${basePath}`,
                    detail: error.message
                });
            }
        })
    );
}

proxyRoute('/api/auth', AUTH_SERVICE_URL, { '^/api/auth': '/auth' });
proxyRoute('/api/fleet', FLEET_SERVICE_URL, { '^/api/fleet': '' });
proxyRoute('/api/trips', TRIP_SERVICE_URL, { '^/api/trips': '/trips' });
proxyRoute('/api/bookings', BOOKING_SERVICE_URL, { '^/api/bookings': '/booking' });
proxyRoute('/api/tracking', TRACKING_SERVICE_URL, { '^/api/tracking': '/tracking' });
proxyRoute('/api/mock-gps', MOCK_GPS_SERVICE_URL, { '^/api/mock-gps': '/mock-gps' });
proxyRoute('/api/analytics', ANALYTICS_SERVICE_URL, { '^/api/analytics': '/analytics' });
proxyRoute('/api/alerts', ALERT_SERVICE_URL, { '^/api/alerts': '/alerts' });
proxyRoute('/api/optimization', OPTIMIZATION_SERVICE_URL, { '^/api/optimization': '/optimization' });
proxyRoute('/api/ml', ML_SERVICE_URL, { '^/api/ml': '' });

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found in API gateway'
    });
});

app.listen(PORT, () => {
    console.log(`api-gateway running on port ${PORT}`);
});
