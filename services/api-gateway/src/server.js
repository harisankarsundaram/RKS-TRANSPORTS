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
app.use(morgan('dev'));

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'api-gateway',
        timestamp: new Date().toISOString()
    });
});

function proxyRoute(basePath, target, rewritePrefix) {
    app.use(
        basePath,
        createProxyMiddleware({
            target,
            changeOrigin: true,
            pathRewrite: (path, req) => {
                // req.url contains the path *after* Express strips basePath (e.g., "/login")
                const subPath = req.url === '/' ? '' : req.url;
                const newPath = rewritePrefix.replace(/\/$/, '') + subPath;
                console.log(`[Proxy] ${req.method} ${req.originalUrl} -> ${target}${newPath}`);
                return newPath;
            },
            onError(error, req, res) {
                console.error(`[Proxy Error] ${req.method} ${req.originalUrl} -> ${target}:`, error.message);
                res.status(502).json({
                    success: false,
                    message: `Gateway proxy error for ${basePath}`,
                    detail: error.message
                });
            }
        })
    );
}

// === Auth Service Routes ===
proxyRoute('/api/auth', AUTH_SERVICE_URL, '/auth');
proxyRoute('/api/notifications', AUTH_SERVICE_URL, '/notifications');

// === Fleet Service Routes (trucks, drivers, maintenance) ===
proxyRoute('/api/fleet', FLEET_SERVICE_URL, '');
proxyRoute('/api/trucks', FLEET_SERVICE_URL, '/trucks');
proxyRoute('/api/drivers', FLEET_SERVICE_URL, '/drivers');
proxyRoute('/api/maintenance', FLEET_SERVICE_URL, '/maintenance');

// === Trip Service Routes (trips, expenses, invoices) ===
proxyRoute('/api/trips', TRIP_SERVICE_URL, '/trips');
proxyRoute('/api/expenses', TRIP_SERVICE_URL, '/expenses');
proxyRoute('/api/invoices', TRIP_SERVICE_URL, '/invoices');

// === Fuel Routes → Alert Service ===
proxyRoute('/api/fuel', ALERT_SERVICE_URL, '/fuel');

// === Booking Service Routes ===
proxyRoute('/api/bookings', BOOKING_SERVICE_URL, '/bookings');
proxyRoute('/api/booking', BOOKING_SERVICE_URL, '/booking');

// === Tracking Service Routes ===
proxyRoute('/api/tracking', TRACKING_SERVICE_URL, '/tracking');

// === Mock GPS Service Routes ===
proxyRoute('/api/mock-gps', MOCK_GPS_SERVICE_URL, '/mock-gps');

// === Analytics Service Routes ===
proxyRoute('/api/analytics', ANALYTICS_SERVICE_URL, '/analytics');

// === Alert Service Routes ===
proxyRoute('/api/alerts', ALERT_SERVICE_URL, '/alerts');

// === Intelligence (fallback aggregation routes) ===
proxyRoute('/api/intelligence/bookings', BOOKING_SERVICE_URL, '/bookings');
proxyRoute('/api/intelligence/fuel/anomalies', ALERT_SERVICE_URL, '/alerts/fuel-anomalies');
proxyRoute('/api/intelligence/fuel', ALERT_SERVICE_URL, '/alerts/fuel-anomalies');
proxyRoute('/api/intelligence/backhaul', OPTIMIZATION_SERVICE_URL, '/optimization');
proxyRoute('/api/intelligence/alerts', ALERT_SERVICE_URL, '/alerts');

// === Optimization Service Routes ===
proxyRoute('/api/optimization', OPTIMIZATION_SERVICE_URL, '/optimization');

// === ML Service Routes ===
proxyRoute('/api/ml', ML_SERVICE_URL, '');

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found in API gateway'
    });
});

app.listen(PORT, () => {
    console.log(`api-gateway running on port ${PORT}`);
});
