require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3103;

app.use(cors());
app.use(express.json());

const HTTP_TIMEOUT_MS = 15000;

function generateLrNumber() {
    return `LR-${Date.now()}`;
}

async function geocodeLocation(locationText) {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        timeout: HTTP_TIMEOUT_MS,
        headers: {
            'User-Agent': 'rks-trip-service/1.0'
        },
        params: {
            q: locationText,
            format: 'json',
            limit: 1
        }
    });

    const hit = response.data?.[0];
    if (!hit) {
        throw new Error(`Could not geocode location: ${locationText}`);
    }

    return {
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
        display_name: hit.display_name
    };
}

function routeScore(route) {
    const distanceKm = route.distance / 1000;
    const durationMin = route.duration / 60;
    return durationMin + (distanceKm * 0.08);
}

async function getOsrmAlternatives(sourceCoord, destinationCoord) {
    const response = await axios.get(
        `https://router.project-osrm.org/route/v1/driving/${sourceCoord.longitude},${sourceCoord.latitude};${destinationCoord.longitude},${destinationCoord.latitude}`,
        {
            timeout: HTTP_TIMEOUT_MS,
            params: {
                alternatives: true,
                overview: 'full',
                geometries: 'geojson',
                steps: false
            }
        }
    );

    if (!Array.isArray(response.data?.routes) || response.data.routes.length === 0) {
        throw new Error('No routes returned from OpenStreetMap routing API');
    }

    return response.data.routes;
}

function summarizeRoute(route, index) {
    return {
        option: index + 1,
        distance_km: Number((route.distance / 1000).toFixed(2)),
        estimated_time_min: Number((route.duration / 60).toFixed(2)),
        score: Number(routeScore(route).toFixed(2)),
        polyline: route.geometry
    };
}

async function recommendRoute(sourceText, destinationText) {
    const sourceCoord = await geocodeLocation(sourceText);
    const destinationCoord = await geocodeLocation(destinationText);

    const routes = await getOsrmAlternatives(sourceCoord, destinationCoord);
    const options = routes.map((route, index) => summarizeRoute(route, index));
    const optimal = options.reduce((best, current) => (current.score < best.score ? current : best), options[0]);

    return {
        source: sourceCoord,
        destination: destinationCoord,
        options,
        optimal
    };
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS trips (
            trip_id SERIAL PRIMARY KEY,
            truck_id INTEGER NOT NULL,
            driver_id INTEGER NOT NULL,
            lr_number VARCHAR(50) UNIQUE NOT NULL,
            source VARCHAR(100) NOT NULL,
            destination VARCHAR(100) NOT NULL,
            route_polyline TEXT,
            distance_km DECIMAL(10,2) DEFAULT 0,
            start_time TIMESTAMP,
            end_time TIMESTAMP,
            status VARCHAR(20) DEFAULT 'Planned' CHECK(status IN ('Planned', 'Running', 'Completed', 'Cancelled')),
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_polyline TEXT');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS trip_routes (
            trip_id INTEGER PRIMARY KEY REFERENCES trips(trip_id) ON DELETE CASCADE,
            route_polyline TEXT NOT NULL,
            distance NUMERIC(10,2) NOT NULL,
            estimated_time NUMERIC(10,2) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_trip_routes_distance ON trip_routes(distance)');
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', service: 'trip-service', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.post('/routes/recommend', async (req, res) => {
    const { source, destination } = req.body;
    if (!source || !destination) {
        return res.status(400).json({ success: false, message: 'source and destination are required' });
    }

    try {
        const recommendation = await recommendRoute(source, destination);
        return res.json({ success: true, data: recommendation });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/trips', async (req, res) => {
    const {
        truck_id,
        driver_id,
        source,
        destination,
        lr_number,
        status = 'Planned',
        base_freight = 0,
        booking_request_id = null
    } = req.body;

    if (!truck_id || !driver_id || !source || !destination) {
        return res.status(400).json({ success: false, message: 'truck_id, driver_id, source and destination are required' });
    }

    const client = await pool.connect();
    try {
        let routeData = null;
        try {
            routeData = await recommendRoute(source, destination);
        } catch (error) {
            routeData = null;
        }

        const chosenRoute = routeData?.optimal || null;

        await client.query('BEGIN');

        const startTime = status === 'Running' ? new Date() : null;

        const inserted = await client.query(
            `INSERT INTO trips (truck_id, driver_id, lr_number, source, destination, route_polyline, distance_km, status, created_at, start_time)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
             RETURNING *`,
            [
                Number(truck_id),
                Number(driver_id),
                lr_number || generateLrNumber(),
                source,
                destination,
                chosenRoute ? JSON.stringify(chosenRoute.polyline.coordinates) : null,
                chosenRoute ? chosenRoute.distance_km : 0,
                status,
                startTime
            ]
        );

        await client.query(`UPDATE trucks SET status = 'Assigned' WHERE truck_id = $1`, [Number(truck_id)]);
        await client.query(`UPDATE drivers SET status = 'Assigned', assigned_truck_id = $1 WHERE driver_id = $2`, [Number(truck_id), Number(driver_id)]);

        if (chosenRoute?.polyline?.coordinates) {
            await client.query(
                `INSERT INTO trip_routes (trip_id, route_polyline, distance, estimated_time)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (trip_id)
                 DO UPDATE SET route_polyline = EXCLUDED.route_polyline, distance = EXCLUDED.distance, estimated_time = EXCLUDED.estimated_time`,
                [
                    inserted.rows[0].trip_id,
                    JSON.stringify(chosenRoute.polyline.coordinates),
                    Number(chosenRoute.distance_km),
                    Number(chosenRoute.estimated_time_min)
                ]
            );
        }

        if (booking_request_id) {
            await client.query(
                `UPDATE booking_requests
                 SET status = 'approved', updated_at = NOW(), approved_trip_id = $1
                 WHERE id = $2`,
                [inserted.rows[0].trip_id, Number(booking_request_id)]
            );
        }

        if (base_freight) {
            await client.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS base_freight NUMERIC(12,2) DEFAULT 0');
            await client.query('UPDATE trips SET base_freight = $1 WHERE trip_id = $2', [Number(base_freight), inserted.rows[0].trip_id]);
        }

        await client.query('COMMIT');

        return res.status(201).json({
            success: true,
            data: inserted.rows[0],
            route: routeData
        });
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
});

app.get('/trips', async (req, res) => {
    const { status } = req.query;

    try {
        const where = [];
        const params = [];

        if (status) {
            params.push(status);
            where.push(`status = $${params.length}`);
        }

        const sql = `
            SELECT *
            FROM trips
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY created_at DESC
        `;

        const result = await pool.query(sql, params);
        return res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/trips/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT t.*, tr.route_polyline AS route_polyline_table, tr.distance AS route_distance, tr.estimated_time AS route_estimated_time
             FROM trips t
             LEFT JOIN trip_routes tr ON tr.trip_id = t.trip_id
             WHERE t.trip_id = $1`,
            [Number(req.params.id)]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        const trip = result.rows[0];
        let route_polyline = null;

        try {
            const rawPolyline = trip.route_polyline_table || trip.route_polyline;
            route_polyline = rawPolyline ? JSON.parse(rawPolyline) : null;
        } catch (error) {
            route_polyline = null;
        }

        return res.json({
            success: true,
            data: {
                ...trip,
                route_polyline,
                route_distance: trip.route_distance !== null ? Number(trip.route_distance) : null,
                route_estimated_time: trip.route_estimated_time !== null ? Number(trip.route_estimated_time) : null
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/trips/:id/route', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT t.trip_id, t.source, t.destination,
                    tr.route_polyline, tr.distance, tr.estimated_time
             FROM trips t
             LEFT JOIN trip_routes tr ON tr.trip_id = t.trip_id
             WHERE t.trip_id = $1`,
            [Number(req.params.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        const row = result.rows[0];
        let routePolyline = null;
        try {
            routePolyline = row.route_polyline ? JSON.parse(row.route_polyline) : null;
        } catch (error) {
            routePolyline = null;
        }

        return res.json({
            success: true,
            data: {
                trip_id: row.trip_id,
                source: row.source,
                destination: row.destination,
                route_polyline: routePolyline,
                distance: row.distance !== null ? Number(row.distance) : null,
                estimated_time: row.estimated_time !== null ? Number(row.estimated_time) : null
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/trips/:id/start', async (req, res) => {
    try {
        const updated = await pool.query(
            `UPDATE trips
             SET status = 'Running', start_time = COALESCE(start_time, NOW())
             WHERE trip_id = $1
             RETURNING *`,
            [Number(req.params.id)]
        );

        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        return res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/trips/:id/end', async (req, res) => {
    const tripId = Number(req.params.id);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const tripResult = await client.query(
            `UPDATE trips
             SET status = 'Completed', end_time = NOW()
             WHERE trip_id = $1
             RETURNING *`,
            [tripId]
        );

        if (tripResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        const trip = tripResult.rows[0];

        await client.query(`UPDATE trucks SET status = 'Available' WHERE truck_id = $1`, [trip.truck_id]);
        await client.query(`UPDATE drivers SET status = 'Available', assigned_truck_id = NULL WHERE driver_id = $1`, [trip.driver_id]);

        await client.query('COMMIT');
        return res.json({ success: true, data: trip });
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`trip-service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('trip-service startup failed:', error);
        process.exit(1);
    });
