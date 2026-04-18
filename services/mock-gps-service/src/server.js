require('dotenv').config();

const cors = require('cors');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3206);
const TICK_MS = Number(process.env.MOCK_GPS_TICK_MS || 5000);

app.use(cors());
app.use(express.json());

let intervalHandle = null;

const MIN_ROUTE_POINTS = Number(process.env.MOCK_GPS_MIN_ROUTE_POINTS || 120);

const CITY_COORDINATES = {
    Chennai: { latitude: 13.0827, longitude: 80.2707 },
    Bangalore: { latitude: 12.9716, longitude: 77.5946 },
    Bengaluru: { latitude: 12.9716, longitude: 77.5946 },
    Hyderabad: { latitude: 17.385, longitude: 78.4867 },
    Coimbatore: { latitude: 11.0168, longitude: 76.9558 },
    Salem: { latitude: 11.6643, longitude: 78.146 },
    Mumbai: { latitude: 19.076, longitude: 72.8777 },
    Pune: { latitude: 18.5204, longitude: 73.8567 },
    Delhi: { latitude: 28.7041, longitude: 77.1025 },
    Kochi: { latitude: 9.9312, longitude: 76.2673 },
    Madurai: { latitude: 9.9252, longitude: 78.1198 },
    Vizag: { latitude: 17.6868, longitude: 83.2185 },
    Erode: { latitude: 11.341, longitude: 77.7172 },
    Trichy: { latitude: 10.7905, longitude: 78.7047 },
    Mysore: { latitude: 12.2958, longitude: 76.6394 },
    Mangalore: { latitude: 12.9141, longitude: 74.856 },
    Nagpur: { latitude: 21.1458, longitude: 79.0882 }
};

function randomBetween(min, max) {
    return (Math.random() * (max - min)) + min;
}

function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

function distanceKm(start, end) {
    const dLat = toRadians(end.latitude - start.latitude);
    const dLon = toRadians(end.longitude - start.longitude);
    const lat1 = toRadians(start.latitude);
    const lat2 = toRadians(end.latitude);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

    return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function hashText(value) {
    const text = String(value || 'unknown');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function resolveCityCoordinate(value) {
    const text = String(value || '').trim();
    if (!text) {
        return null;
    }

    const normalized = text.toLowerCase();
    for (const [city, coordinate] of Object.entries(CITY_COORDINATES)) {
        if (normalized.includes(city.toLowerCase())) {
            return coordinate;
        }
    }

    const h1 = hashText(text);
    const h2 = hashText(`${text}-lng`);

    return {
        // Keep deterministic fallback inside India bounds to avoid sea points.
        latitude: 8 + ((h1 % 2600) / 100),
        longitude: 68 + ((h2 % 2900) / 100)
    };
}

function parseRoutePolyline(rawPolyline) {
    if (!rawPolyline) {
        return [];
    }

    try {
        const parsed = typeof rawPolyline === 'string' ? JSON.parse(rawPolyline) : rawPolyline;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((point) => {
                if (Array.isArray(point) && point.length >= 2) {
                    return {
                        longitude: Number(point[0]),
                        latitude: Number(point[1])
                    };
                }

                if (point && point.longitude !== undefined && point.latitude !== undefined) {
                    return {
                        longitude: Number(point.longitude),
                        latitude: Number(point.latitude)
                    };
                }

                if (point && point.lng !== undefined && point.lat !== undefined) {
                    return {
                        longitude: Number(point.lng),
                        latitude: Number(point.lat)
                    };
                }

                return null;
            })
            .filter((point) => point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
    } catch {
        return [];
    }
}

function interpolatePoint(start, end, ratio) {
    return {
        latitude: Number((start.latitude + ((end.latitude - start.latitude) * ratio)).toFixed(6)),
        longitude: Number((start.longitude + ((end.longitude - start.longitude) * ratio)).toFixed(6))
    };
}

function densifyRoute(route, minPoints = MIN_ROUTE_POINTS) {
    if (!Array.isArray(route) || route.length < 2) {
        return Array.isArray(route) ? route : [];
    }

    if (!Number.isFinite(minPoints) || minPoints <= route.length) {
        return route;
    }

    const segments = route.length - 1;
    const interiorPoints = Math.max(minPoints - 1, segments);
    const baseSubdivisions = Math.floor(interiorPoints / segments);
    const remainder = interiorPoints % segments;
    const densified = [route[0]];

    for (let index = 0; index < segments; index += 1) {
        const start = route[index];
        const end = route[index + 1];
        const subdivisions = Math.max(1, baseSubdivisions + (index < remainder ? 1 : 0));

        for (let step = 1; step <= subdivisions; step += 1) {
            densified.push(interpolatePoint(start, end, step / subdivisions));
        }
    }

    return densified;
}

function buildSyntheticRoute(sourceText, destinationText, points = 10) {
    const source = resolveCityCoordinate(sourceText);
    const destination = resolveCityCoordinate(destinationText);

    if (!source || !destination) {
        return [];
    }

    const route = [];
    for (let index = 0; index < points; index += 1) {
        const t = points === 1 ? 1 : index / (points - 1);
        const bend = Math.sin(Math.PI * t) * 0.17;

        const latitude = source.latitude + ((destination.latitude - source.latitude) * t)
            + (bend * ((destination.longitude - source.longitude) / 8));
        const longitude = source.longitude + ((destination.longitude - source.longitude) * t)
            - (bend * ((destination.latitude - source.latitude) / 8));

        route.push({
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6))
        });
    }

    return route;
}

function squaredDistance(a, b) {
    const dLat = a.latitude - b.latitude;
    const dLng = a.longitude - b.longitude;
    return (dLat * dLat) + (dLng * dLng);
}

function nearestIndex(route, point) {
    let best = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    route.forEach((routePoint, index) => {
        const score = squaredDistance(routePoint, point);
        if (score < bestScore) {
            bestScore = score;
            best = index;
        }
    });

    return best;
}

function resolveTripRoute(trip) {
    const parsed = parseRoutePolyline(trip.route_polyline);
    if (parsed.length > 1) {
        return parsed;
    }

    return buildSyntheticRoute(trip.source, trip.destination);
}

function chooseSpeed(distanceToDestinationKm) {
    if (distanceToDestinationKm < 1) {
        return randomBetween(0, 18);
    }

    const stopChance = Math.random();
    if (stopChance < 0.1) {
        return 0;
    }

    const overspeedChance = Math.random();
    if (overspeedChance < 0.08) {
        return randomBetween(82, 95);
    }

    return randomBetween(32, 72);
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS gps_logs (
            gps_id SERIAL PRIMARY KEY,
            truck_id INTEGER NOT NULL,
            trip_id INTEGER NOT NULL,
            latitude NUMERIC(10,7) NOT NULL,
            longitude NUMERIC(10,7) NOT NULL,
            speed NUMERIC(10,2) NOT NULL,
            timestamp TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_mock_gps_trip_time_phase2 ON gps_logs(trip_id, timestamp DESC)');
}

async function fetchActiveTrips(optionalTripId = null) {
    const params = [];
    const where = ["LOWER(status) IN ('in_progress', 'running')"];

    if (optionalTripId) {
        params.push(Number(optionalTripId));
        where.push(`trip_id = $${params.length}`);
    }

    const result = await pool.query(
        `SELECT trip_id, truck_id, source, destination, status, route_polyline
         FROM trips
         WHERE ${where.join(' AND ')}
         ORDER BY trip_id ASC`,
        params
    );

    return result.rows;
}

async function latestPoint(tripId) {
    const result = await pool.query(
        `SELECT latitude, longitude, speed, timestamp
         FROM gps_logs
         WHERE trip_id = $1
         ORDER BY timestamp DESC
         LIMIT 1`,
        [tripId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return {
        latitude: Number(result.rows[0].latitude),
        longitude: Number(result.rows[0].longitude),
        speed: Number(result.rows[0].speed),
        timestamp: result.rows[0].timestamp
    };
}

async function insertLog({ truck_id, trip_id, latitude, longitude, speed }) {
    const inserted = await pool.query(
        `INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, speed, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING truck_id, trip_id, latitude, longitude, speed, timestamp`,
        [truck_id, trip_id, latitude, longitude, speed]
    );

    return inserted.rows[0];
}

async function tickTrip(trip) {
    const route = densifyRoute(resolveTripRoute(trip));
    if (route.length < 2) {
        return null;
    }

    const current = await latestPoint(trip.trip_id);
    const startPoint = current || route[0];
    const currentIndex = current
        ? nearestIndex(route, {
            latitude: Number(current.latitude),
            longitude: Number(current.longitude)
        })
        : 0;
    const nextIndex = Math.min(currentIndex + 1, route.length - 1);
    const nextPoint = route[nextIndex];
    const destination = route[route.length - 1];
    const remaining = distanceKm(nextPoint, destination);
    const speed = chooseSpeed(remaining);

    const pointForInsert = speed === 0
        ? { latitude: Number(startPoint.latitude), longitude: Number(startPoint.longitude) }
        : nextPoint;

    const inserted = await insertLog({
        truck_id: Number(trip.truck_id),
        trip_id: Number(trip.trip_id),
        latitude: pointForInsert.latitude,
        longitude: pointForInsert.longitude,
        speed
    });

    return {
        truck_id: Number(inserted.truck_id),
        trip_id: Number(inserted.trip_id),
        latitude: Number(inserted.latitude),
        longitude: Number(inserted.longitude),
        speed: Number(inserted.speed),
        timestamp: inserted.timestamp
    };
}

async function tickTrips(optionalTripId = null) {
    const activeTrips = await fetchActiveTrips(optionalTripId);
    const updates = [];

    for (const trip of activeTrips) {
        const update = await tickTrip(trip);
        if (update) {
            updates.push(update);
        }
    }

    return updates;
}

function startAutoTick() {
    if (intervalHandle) {
        return;
    }

    intervalHandle = setInterval(() => {
        tickTrips().catch((error) => {
            console.error('mock-gps auto tick failed:', error.message);
        });
    }, TICK_MS);

    if (typeof intervalHandle.unref === 'function') {
        intervalHandle.unref();
    }
}

function stopAutoTick() {
    if (!intervalHandle) {
        return;
    }

    clearInterval(intervalHandle);
    intervalHandle = null;
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({
            status: 'OK',
            service: 'mock-gps-service',
            tick_ms: TICK_MS,
            running: Boolean(intervalHandle),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.post('/mock-gps/tick', async (req, res) => {
    const { trip_id = null } = req.body || {};

    try {
        const updates = await tickTrips(trip_id);
        return res.json({ success: true, count: updates.length, data: updates });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/mock-gps/start', (req, res) => {
    startAutoTick();
    return res.json({ success: true, running: true, tick_ms: TICK_MS });
});

app.post('/mock-gps/stop', (req, res) => {
    stopAutoTick();
    return res.json({ success: true, running: false, tick_ms: TICK_MS });
});

app.get('/mock-gps/state', async (req, res) => {
    try {
        const activeTrips = await fetchActiveTrips();
        return res.json({
            success: true,
            running: Boolean(intervalHandle),
            tick_ms: TICK_MS,
            active_trip_count: activeTrips.length
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`mock-gps-service running on port ${PORT}`);
            startAutoTick();
        });
    })
    .catch((error) => {
        console.error('mock-gps-service startup failed:', error);
        process.exit(1);
    });
