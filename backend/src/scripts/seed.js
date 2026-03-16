const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const initDatabase = require('../config/initDb');

const DEFAULT_PASSWORD = '1234';
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OPENROUTESERVICE_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/driving-car';
const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';
const ROUTE_TIMEOUT_MS = Number(process.env.SEED_ROUTE_TIMEOUT_MS || 12000);

const CITY_COORDINATES = {
    Chennai: { latitude: 13.0827, longitude: 80.2707 },
    Bangalore: { latitude: 12.9716, longitude: 77.5946 },
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

const geocodeCache = new Map();
const routeCache = new Map();

function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

function haversineDistanceKm(start, end) {
    const dLat = toRadians(end.latitude - start.latitude);
    const dLon = toRadians(end.longitude - start.longitude);

    const lat1 = toRadians(start.latitude);
    const lat2 = toRadians(end.latitude);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

    return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function routeDistanceKm(route) {
    if (!Array.isArray(route) || route.length < 2) {
        return 0;
    }

    let total = 0;
    for (let index = 1; index < route.length; index += 1) {
        total += haversineDistanceKm(route[index - 1], route[index]);
    }
    return total;
}

function resolveCityCoordinate(cityName) {
    const known = CITY_COORDINATES[cityName];
    if (known) {
        return known;
    }

    // Deterministic fallback coordinate if a city is not in the static map.
    const seed = String(cityName || 'unknown').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const latitude = 9 + ((seed % 1500) / 100);
    const longitude = 73 + ((seed % 1400) / 100);
    return { latitude, longitude };
}

function buildSyntheticRoute(sourceCity, destinationCity, points = 8) {
    const start = resolveCityCoordinate(sourceCity);
    const end = resolveCityCoordinate(destinationCity);
    const route = [];

    for (let index = 0; index < points; index += 1) {
        const t = points === 1 ? 1 : index / (points - 1);

        // Adds a mild curve so every route is not a perfect straight line.
        const bend = Math.sin(Math.PI * t) * 0.2;
        const latitude = start.latitude + ((end.latitude - start.latitude) * t) + (bend * ((end.longitude - start.longitude) / 6));
        const longitude = start.longitude + ((end.longitude - start.longitude) * t) - (bend * ((end.latitude - start.latitude) / 6));

        route.push({
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6))
        });
    }

    return route;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = ROUTE_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`Route request failed (${response.status})`);
        }

        return response.json();
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function normalizePoint(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }

    return {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lon.toFixed(6))
    };
}

async function geocodeLocation(locationText) {
    const normalized = String(locationText || '').trim();
    if (!normalized) {
        return null;
    }

    const cacheKey = normalized.toLowerCase();
    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey);
    }

    try {
        const query = new URLSearchParams({
            q: normalized,
            format: 'json',
            limit: '1'
        });

        const payload = await fetchJsonWithTimeout(
            `${NOMINATIM_ENDPOINT}?${query.toString()}`,
            {
                headers: {
                    'User-Agent': 'rks-seed-script/1.0'
                }
            }
        );

        const hit = Array.isArray(payload) ? payload[0] : null;
        const point = hit ? normalizePoint(hit.lat, hit.lon) : null;
        geocodeCache.set(cacheKey, point);
        return point;
    } catch {
        geocodeCache.set(cacheKey, null);
        return null;
    }
}

function normalizeCoordinates(coordinates) {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    return coordinates
        .map((entry) => {
            if (!Array.isArray(entry) || entry.length < 2) {
                return null;
            }

            return normalizePoint(entry[1], entry[0]);
        })
        .filter((point) => point !== null);
}

async function fetchRouteFromOpenRouteService(start, end, apiKey) {
    const normalizedKey = String(apiKey || '').trim();
    if (!normalizedKey) {
        return null;
    }

    try {
        const query = new URLSearchParams({
            api_key: normalizedKey,
            start: `${start.longitude},${start.latitude}`,
            end: `${end.longitude},${end.latitude}`,
            geometry_format: 'geojson'
        });

        const payload = await fetchJsonWithTimeout(
            `${OPENROUTESERVICE_ENDPOINT}?${query.toString()}`,
            {
                headers: {
                    Accept: 'application/json, application/geo+json',
                    'Content-Type': 'application/json; charset=utf-8',
                    'User-Agent': 'rks-seed-script/1.0'
                }
            }
        );

        const geoJsonCoordinates = payload?.features?.[0]?.geometry?.coordinates;
        const legacyCoordinates = payload?.routes?.[0]?.geometry?.coordinates;
        const coordinates = Array.isArray(geoJsonCoordinates) ? geoJsonCoordinates : legacyCoordinates;
        const normalizedRoute = normalizeCoordinates(coordinates);

        return normalizedRoute.length > 1 ? normalizedRoute : null;
    } catch {
        return null;
    }
}

async function fetchRouteFromOsrm(start, end) {
    try {
        const query = new URLSearchParams({
            alternatives: 'false',
            overview: 'full',
            geometries: 'geojson',
            steps: 'false'
        });

        const payload = await fetchJsonWithTimeout(
            `${OSRM_ENDPOINT}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?${query.toString()}`,
            {
                headers: {
                    'User-Agent': 'rks-seed-script/1.0'
                }
            }
        );

        const routeCoordinates = payload?.routes?.[0]?.geometry?.coordinates;
        const normalizedRoute = normalizeCoordinates(routeCoordinates);

        return normalizedRoute.length > 1 ? normalizedRoute : null;
    } catch {
        return null;
    }
}

async function buildRouteWithFallback(sourceCity, destinationCity, syntheticPoints = 8) {
    const routeCacheKey = `${String(sourceCity || '').trim().toLowerCase()}::${String(destinationCity || '').trim().toLowerCase()}`;
    if (routeCache.has(routeCacheKey)) {
        return routeCache.get(routeCacheKey);
    }

    const providerMode = String(process.env.SEED_ROUTE_PROVIDER || 'auto').toLowerCase();
    const routeEngine = String(process.env.SEED_ROUTE_ENGINE || 'openrouteservice').toLowerCase();

    const shouldUseExternal = providerMode === 'auto' || providerMode === 'external';
    if (shouldUseExternal) {
        const [start, end] = await Promise.all([
            geocodeLocation(sourceCity),
            geocodeLocation(destinationCity)
        ]);

        if (start && end) {
            let externalRoute = null;

            if (routeEngine === 'openrouteservice' || routeEngine === 'ors' || routeEngine === 'auto') {
                externalRoute = await fetchRouteFromOpenRouteService(
                    start,
                    end,
                    process.env.OPENROUTESERVICE_API_KEY || process.env.REAL_GPS_API_KEY
                );
            }

            if (!externalRoute && (routeEngine === 'osrm' || routeEngine === 'openrouteservice' || routeEngine === 'ors' || routeEngine === 'auto')) {
                externalRoute = await fetchRouteFromOsrm(start, end);
            }

            if (externalRoute && externalRoute.length > 1) {
                routeCache.set(routeCacheKey, externalRoute);
                return externalRoute;
            }
        }
    }

    const syntheticRoute = buildSyntheticRoute(sourceCity, destinationCity, syntheticPoints);
    routeCache.set(routeCacheKey, syntheticRoute);
    return syntheticRoute;
}

function asPolyline(route) {
    return JSON.stringify(route.map((point) => [point.longitude, point.latitude]));
}

function hoursAgo(hours) {
    return new Date(Date.now() - (hours * 60 * 60 * 1000));
}

function daysAgo(days) {
    return new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
}

function daysFromNow(days) {
    return new Date(Date.now() + (days * 24 * 60 * 60 * 1000));
}

function isoDate(dateValue) {
    return dateValue.toISOString().slice(0, 10);
}

async function seed() {
    let client = null;

    try {
        console.log('🚀 Starting canonical full-data seed...');

        const initialized = await initDatabase();
        if (!initialized) {
            throw new Error('Database initialization failed. Aborting seed.');
        }

        client = await pool.connect();
        await client.query('BEGIN');

        await client.query(`
            TRUNCATE TABLE
                notifications,
                alerts,
                booking_requests,
                invoices,
                expenses,
                maintenance,
                fuel_logs,
                gps_logs,
                trip_routes,
                trips,
                drivers,
                trucks,
                users
            RESTART IDENTITY CASCADE
        `);

        const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

        const users = [
            { email: 'admin@rks.com', role: 'admin', name: 'RKS Admin', phone: '9000000001' },
            { email: 'manager@rks.com', role: 'manager', name: 'Ops Manager', phone: '9000000002' },
            { email: 'driver.abi@rks.com', role: 'driver', name: 'Abi Kumar', phone: '9000000101' },
            { email: 'driver.ravi@rks.com', role: 'driver', name: 'Ravi Prakash', phone: '9000000102' },
            { email: 'driver.mani@rks.com', role: 'driver', name: 'Manikandan R', phone: '9000000103' },
            { email: 'driver.selva@rks.com', role: 'driver', name: 'Selvaraj V', phone: '9000000104' },
            { email: 'driver.yasin@rks.com', role: 'driver', name: 'Yasin Ali', phone: '9000000105' },
            { email: 'driver.arun@rks.com', role: 'driver', name: 'Arun Babu', phone: '9000000106' }
        ];

        const userIdByEmail = new Map();
        for (const user of users) {
            const result = await client.query(
                `INSERT INTO users (email, password_hash, role, name, phone)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING user_id`,
                [user.email, passwordHash, user.role, user.name, user.phone]
            );
            userIdByEmail.set(user.email, result.rows[0].user_id);
        }

        const trucks = [
            { truck_number: 'TN38AB1001', capacity: 16, mileage_kmpl: 4.8, status: 'Assigned' },
            { truck_number: 'TN38CD2202', capacity: 14, mileage_kmpl: 4.5, status: 'Assigned' },
            { truck_number: 'KA01EF3303', capacity: 18, mileage_kmpl: 4.2, status: 'Assigned' },
            { truck_number: 'KA02GH4404', capacity: 12, mileage_kmpl: 5.1, status: 'Available' },
            { truck_number: 'AP03JK5505', capacity: 20, mileage_kmpl: 3.9, status: 'Maintenance' },
            { truck_number: 'MH04LM6606', capacity: 15, mileage_kmpl: 4.6, status: 'Available' }
        ];

        const insuranceExpiry = isoDate(daysFromNow(380));
        const fitnessExpiry = isoDate(daysFromNow(280));
        const truckByNumber = new Map();

        for (const truck of trucks) {
            const result = await client.query(
                `INSERT INTO trucks (truck_number, capacity, mileage_kmpl, status, insurance_expiry, fitness_expiry)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING truck_id, truck_number, mileage_kmpl`,
                [
                    truck.truck_number,
                    truck.capacity,
                    truck.mileage_kmpl,
                    truck.status,
                    insuranceExpiry,
                    fitnessExpiry
                ]
            );
            truckByNumber.set(truck.truck_number, result.rows[0]);
        }

        const drivers = [
            { email: 'driver.abi@rks.com', license_number: 'TN-DRV-0001', assigned_truck: 'TN38AB1001', status: 'Assigned' },
            { email: 'driver.ravi@rks.com', license_number: 'TN-DRV-0002', assigned_truck: 'TN38CD2202', status: 'Assigned' },
            { email: 'driver.mani@rks.com', license_number: 'TN-DRV-0003', assigned_truck: 'KA01EF3303', status: 'Assigned' },
            { email: 'driver.selva@rks.com', license_number: 'TN-DRV-0004', assigned_truck: null, status: 'Available' },
            { email: 'driver.yasin@rks.com', license_number: 'TN-DRV-0005', assigned_truck: null, status: 'Available' },
            { email: 'driver.arun@rks.com', license_number: 'TN-DRV-0006', assigned_truck: null, status: 'Available' }
        ];

        const licenseExpiry = isoDate(daysFromNow(730));
        const driverByEmail = new Map();

        for (const driver of drivers) {
            const userId = userIdByEmail.get(driver.email);
            const assignedTruckId = driver.assigned_truck
                ? truckByNumber.get(driver.assigned_truck)?.truck_id || null
                : null;

            const result = await client.query(
                `INSERT INTO drivers (user_id, name, phone, license_number, license_expiry, status, assigned_truck_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING driver_id`,
                [
                    userId,
                    users.find((user) => user.email === driver.email).name,
                    users.find((user) => user.email === driver.email).phone,
                    driver.license_number,
                    licenseExpiry,
                    driver.status,
                    assignedTruckId
                ]
            );
            driverByEmail.set(driver.email, result.rows[0].driver_id);
        }

        const tripSeeds = [
            {
                lr_number: 'RKS-24001',
                truck_number: 'KA02GH4404',
                driver_email: 'driver.selva@rks.com',
                source: 'Chennai',
                destination: 'Bangalore',
                base_freight: 62000,
                toll_amount: 2900,
                loading_cost: 1100,
                unloading_cost: 1200,
                fast_tag: 700,
                gst_percentage: 5,
                driver_bata: 3200,
                status: 'Completed',
                start_time: hoursAgo(120),
                end_time: hoursAgo(108),
                created_at: hoursAgo(124),
                active_progress: 1
            },
            {
                lr_number: 'RKS-24002',
                truck_number: 'MH04LM6606',
                driver_email: 'driver.yasin@rks.com',
                source: 'Coimbatore',
                destination: 'Hyderabad',
                base_freight: 98000,
                toll_amount: 5100,
                loading_cost: 1800,
                unloading_cost: 1700,
                fast_tag: 1300,
                gst_percentage: 12,
                driver_bata: 4800,
                status: 'Completed',
                start_time: hoursAgo(96),
                end_time: hoursAgo(70),
                created_at: hoursAgo(100),
                active_progress: 1
            },
            {
                lr_number: 'RKS-24003',
                truck_number: 'TN38AB1001',
                driver_email: 'driver.abi@rks.com',
                source: 'Salem',
                destination: 'Mumbai',
                base_freight: 124000,
                toll_amount: 6400,
                loading_cost: 2200,
                unloading_cost: 2000,
                fast_tag: 1500,
                gst_percentage: 12,
                driver_bata: 6200,
                status: 'Completed',
                start_time: hoursAgo(80),
                end_time: hoursAgo(46),
                created_at: hoursAgo(82),
                active_progress: 1,
                high_fuel_anomaly: true
            },
            {
                lr_number: 'RKS-24004',
                truck_number: 'TN38CD2202',
                driver_email: 'driver.ravi@rks.com',
                source: 'Pune',
                destination: 'Chennai',
                base_freight: 116000,
                toll_amount: 5900,
                loading_cost: 2100,
                unloading_cost: 1900,
                fast_tag: 1200,
                gst_percentage: 12,
                driver_bata: 5800,
                status: 'Completed',
                start_time: hoursAgo(64),
                end_time: hoursAgo(34),
                created_at: hoursAgo(66),
                active_progress: 1
            },
            {
                lr_number: 'RKS-24005',
                truck_number: 'TN38AB1001',
                driver_email: 'driver.abi@rks.com',
                source: 'Bangalore',
                destination: 'Delhi',
                base_freight: 156000,
                toll_amount: 8800,
                loading_cost: 2600,
                unloading_cost: 2500,
                fast_tag: 1900,
                gst_percentage: 12,
                driver_bata: 7200,
                status: 'Running',
                start_time: hoursAgo(22),
                end_time: null,
                created_at: hoursAgo(24),
                planned_arrival_time: hoursFromNow(24),
                active_progress: 0.58
            },
            {
                lr_number: 'RKS-24006',
                truck_number: 'TN38CD2202',
                driver_email: 'driver.ravi@rks.com',
                source: 'Madurai',
                destination: 'Kochi',
                base_freight: 44000,
                toll_amount: 1400,
                loading_cost: 900,
                unloading_cost: 950,
                fast_tag: 420,
                gst_percentage: 5,
                driver_bata: 2400,
                status: 'Running',
                start_time: hoursAgo(11),
                end_time: null,
                created_at: hoursAgo(12),
                planned_arrival_time: hoursFromNow(8),
                active_progress: 0.64
            },
            {
                lr_number: 'RKS-24007',
                truck_number: 'KA01EF3303',
                driver_email: 'driver.mani@rks.com',
                source: 'Erode',
                destination: 'Vizag',
                base_freight: 101000,
                toll_amount: 4700,
                loading_cost: 1700,
                unloading_cost: 1800,
                fast_tag: 1100,
                gst_percentage: 12,
                driver_bata: 5200,
                status: 'Planned',
                start_time: null,
                end_time: null,
                created_at: hoursAgo(2),
                planned_arrival_time: hoursFromNow(52),
                active_progress: 0
            },
            {
                lr_number: 'RKS-24008',
                truck_number: 'MH04LM6606',
                driver_email: 'driver.arun@rks.com',
                source: 'Trichy',
                destination: 'Mysore',
                base_freight: 38000,
                toll_amount: 1200,
                loading_cost: 850,
                unloading_cost: 900,
                fast_tag: 350,
                gst_percentage: 5,
                driver_bata: 2100,
                status: 'Cancelled',
                start_time: null,
                end_time: null,
                created_at: hoursAgo(30),
                planned_arrival_time: hoursFromNow(10),
                active_progress: 0
            }
        ];

        function hoursFromNow(hours) {
            return new Date(Date.now() + (hours * 60 * 60 * 1000));
        }

        const seededTrips = [];
        const gpsMetaByTripId = new Map();

        for (const seedTrip of tripSeeds) {
            const truck = truckByNumber.get(seedTrip.truck_number);
            const driverId = driverByEmail.get(seedTrip.driver_email);
            const route = await buildRouteWithFallback(seedTrip.source, seedTrip.destination, 9);
            const totalDistance = Number(routeDistanceKm(route).toFixed(2));
            const travelledDistance = Number((totalDistance * (seedTrip.active_progress || 0)).toFixed(2));

            const emptyKm = seedTrip.status === 'Completed' || seedTrip.status === 'Running'
                ? Number((totalDistance * 0.1).toFixed(2))
                : 0;
            const loadedKm = seedTrip.status === 'Completed' || seedTrip.status === 'Running'
                ? Number((totalDistance - emptyKm).toFixed(2))
                : 0;

            const insertResult = await client.query(
                `INSERT INTO trips (
                    truck_id,
                    driver_id,
                    lr_number,
                    source,
                    destination,
                    route_polyline,
                    distance_km,
                    gps_distance_km,
                    base_freight,
                    toll_amount,
                    loading_cost,
                    unloading_cost,
                    fast_tag,
                    gst_percentage,
                    driver_bata,
                    empty_km,
                    loaded_km,
                    start_time,
                    planned_arrival_time,
                    end_time,
                    status,
                    created_at
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
                ) RETURNING trip_id`,
                [
                    truck.truck_id,
                    driverId,
                    seedTrip.lr_number,
                    seedTrip.source,
                    seedTrip.destination,
                    asPolyline(route),
                    totalDistance,
                    travelledDistance,
                    seedTrip.base_freight,
                    seedTrip.toll_amount,
                    seedTrip.loading_cost,
                    seedTrip.unloading_cost,
                    seedTrip.fast_tag,
                    seedTrip.gst_percentage,
                    seedTrip.driver_bata,
                    emptyKm,
                    loadedKm,
                    seedTrip.start_time,
                    seedTrip.planned_arrival_time || null,
                    seedTrip.end_time,
                    seedTrip.status,
                    seedTrip.created_at
                ]
            );

            const tripId = insertResult.rows[0].trip_id;
            const estimatedMinutes = Number(((totalDistance / 42) * 60).toFixed(2));

            await client.query(
                `INSERT INTO trip_routes (trip_id, route_polyline, distance, estimated_time)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (trip_id)
                 DO UPDATE SET route_polyline = EXCLUDED.route_polyline, distance = EXCLUDED.distance, estimated_time = EXCLUDED.estimated_time`,
                [tripId, asPolyline(route), totalDistance, estimatedMinutes]
            );

            seededTrips.push({
                ...seedTrip,
                trip_id: tripId,
                truck_id: truck.truck_id,
                truck_mileage: Number(truck.mileage_kmpl || 4.5),
                route,
                total_distance: totalDistance,
                travelled_distance: travelledDistance
            });

            gpsMetaByTripId.set(tripId, {
                route,
                status: seedTrip.status,
                start: seedTrip.start_time,
                end: seedTrip.end_time,
                progress: seedTrip.active_progress || 0
            });
        }

        for (const seededTrip of seededTrips) {
            if (!['Completed', 'Running'].includes(seededTrip.status)) {
                continue;
            }

            const meta = gpsMetaByTripId.get(seededTrip.trip_id);
            const points = meta.route;
            const maxIndex = seededTrip.status === 'Running'
                ? Math.max(2, Math.floor((points.length - 1) * Math.max(meta.progress, 0.45)))
                : points.length - 1;

            const gpsPoints = points.slice(0, maxIndex + 1);
            const startTime = new Date(meta.start || seededTrip.created_at || new Date());
            const endTime = seededTrip.status === 'Completed'
                ? new Date(meta.end || new Date())
                : new Date();

            const durationMs = Math.max(endTime.getTime() - startTime.getTime(), 1);

            for (let index = 0; index < gpsPoints.length; index += 1) {
                const position = gpsPoints[index];
                const ratio = gpsPoints.length === 1 ? 1 : index / (gpsPoints.length - 1);
                const recordedAt = new Date(startTime.getTime() + (durationMs * ratio));

                let speed = 38 + ((index * 7) % 19);
                if (seededTrip.status === 'Completed' && index === gpsPoints.length - 1) {
                    speed = 0;
                }

                await client.query(
                    `INSERT INTO gps_logs (truck_id, trip_id, latitude, longitude, speed_kmph, ignition, recorded_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        seededTrip.truck_id,
                        seededTrip.trip_id,
                        position.latitude,
                        position.longitude,
                        speed,
                        speed > 0,
                        recordedAt
                    ]
                );
            }
        }

        for (const seededTrip of seededTrips) {
            if (!['Completed', 'Running'].includes(seededTrip.status)) {
                continue;
            }

            const travelled = seededTrip.status === 'Completed'
                ? seededTrip.total_distance
                : seededTrip.travelled_distance;

            const expectedFuel = travelled / Math.max(seededTrip.truck_mileage, 0.1);
            const multiplier = seededTrip.high_fuel_anomaly
                ? 1.34
                : seededTrip.status === 'Running'
                    ? 1.05
                    : 1.08;

            const actualFuel = Number((expectedFuel * multiplier).toFixed(2));
            const stopCount = Math.max(1, Math.round(travelled / 320));
            let accumulatedFuel = 0;

            const startTime = new Date(seededTrip.start_time || seededTrip.created_at || new Date());
            const endTime = seededTrip.status === 'Completed'
                ? new Date(seededTrip.end_time || new Date())
                : new Date();
            const durationMs = Math.max(endTime.getTime() - startTime.getTime(), 1);

            for (let index = 0; index < stopCount; index += 1) {
                const share = index === stopCount - 1
                    ? Number((actualFuel - accumulatedFuel).toFixed(2))
                    : Number((actualFuel / stopCount).toFixed(2));

                accumulatedFuel += share;

                const pricePerLiter = Number((95.5 + ((index + 1) * 0.9)).toFixed(2));
                const totalCost = Number((share * pricePerLiter).toFixed(2));
                const ratio = stopCount === 1 ? 1 : (index + 1) / stopCount;
                const stopTime = new Date(startTime.getTime() + (durationMs * ratio));

                await client.query(
                    `INSERT INTO fuel_logs (
                        truck_id,
                        trip_id,
                        liters,
                        fuel_filled,
                        odometer_reading,
                        price_per_liter,
                        total_cost,
                        timestamp,
                        created_at
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                    [
                        seededTrip.truck_id,
                        seededTrip.trip_id,
                        share,
                        share,
                        Number((160000 + (seededTrip.total_distance * ratio)).toFixed(2)),
                        pricePerLiter,
                        totalCost,
                        stopTime,
                        stopTime
                    ]
                );
            }
        }

        const maintenanceRows = [
            { truck_number: 'AP03JK5505', service_date: isoDate(daysAgo(20)), description: 'Engine overhaul and injector calibration', cost: 48000 },
            { truck_number: 'KA02GH4404', service_date: isoDate(daysAgo(35)), description: 'Brake pads and wheel alignment', cost: 13800 },
            { truck_number: 'TN38CD2202', service_date: isoDate(daysAgo(15)), description: 'Suspension bush replacement', cost: 9700 },
            { truck_number: 'MH04LM6606', service_date: isoDate(daysAgo(55)), description: 'AC compressor and refrigerant refill', cost: 11200 }
        ];

        for (const row of maintenanceRows) {
            await client.query(
                `INSERT INTO maintenance (truck_id, service_date, description, cost, created_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    truckByNumber.get(row.truck_number).truck_id,
                    row.service_date,
                    row.description,
                    row.cost,
                    row.service_date
                ]
            );
        }

        for (const seededTrip of seededTrips) {
            if (!['Completed', 'Running'].includes(seededTrip.status)) {
                continue;
            }

            const fuelTotalResult = await client.query(
                'SELECT COALESCE(SUM(total_cost), 0) AS total FROM fuel_logs WHERE trip_id = $1',
                [seededTrip.trip_id]
            );
            const fuelTotal = Number(fuelTotalResult.rows[0].total || 0);

            const expenseRows = [
                { category: 'Fuel', amount: fuelTotal, description: `Fuel spend for ${seededTrip.lr_number}` },
                { category: 'Toll', amount: seededTrip.toll_amount, description: `Toll charges for ${seededTrip.source} to ${seededTrip.destination}` },
                { category: 'Driver', amount: seededTrip.driver_bata, description: `Driver bata for ${seededTrip.lr_number}` },
                { category: 'Misc', amount: seededTrip.status === 'Running' ? 650 : 950, description: `Trip incidentals for ${seededTrip.lr_number}` }
            ];

            for (const expense of expenseRows) {
                await client.query(
                    `INSERT INTO expenses (trip_id, truck_id, category, amount, description, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        seededTrip.trip_id,
                        seededTrip.truck_id,
                        expense.category,
                        Number(expense.amount || 0),
                        expense.description,
                        seededTrip.created_at
                    ]
                );
            }
        }

        const nonTripExpenses = [
            {
                truck_number: 'AP03JK5505',
                category: 'Maintenance',
                amount: 48000,
                description: 'Major workshop bill for AP03JK5505',
                created_at: daysAgo(20)
            },
            {
                truck_number: 'KA01EF3303',
                category: 'Insurance',
                amount: 36000,
                description: 'Annual insurance premium',
                created_at: daysAgo(12)
            },
            {
                truck_number: 'TN38AB1001',
                category: 'RTO',
                amount: 6500,
                description: 'Fitness and permit renewal',
                created_at: daysAgo(8)
            }
        ];

        for (const expense of nonTripExpenses) {
            await client.query(
                `INSERT INTO expenses (trip_id, truck_id, category, amount, description, created_at)
                 VALUES (NULL, $1, $2, $3, $4, $5)`,
                [
                    truckByNumber.get(expense.truck_number).truck_id,
                    expense.category,
                    expense.amount,
                    expense.description,
                    expense.created_at
                ]
            );
        }

        const completedTrips = seededTrips.filter((trip) => trip.status === 'Completed');
        const invoiceStatusOrder = ['Paid', 'Partial', 'Pending', 'Paid'];

        for (let index = 0; index < completedTrips.length; index += 1) {
            const trip = completedTrips[index];
            const status = invoiceStatusOrder[index % invoiceStatusOrder.length];

            const subtotal = Number((
                trip.base_freight +
                trip.toll_amount +
                trip.loading_cost +
                trip.unloading_cost +
                trip.fast_tag
            ).toFixed(2));

            const gstAmount = Number((subtotal * (trip.gst_percentage / 100)).toFixed(2));
            const totalAmount = Number((subtotal + gstAmount).toFixed(2));
            const amountPaid = status === 'Paid'
                ? totalAmount
                : status === 'Partial'
                    ? Number((totalAmount * 0.55).toFixed(2))
                    : 0;

            const invoiceDate = new Date(trip.end_time || trip.created_at || new Date());
            const dueDate = new Date(invoiceDate.getTime() + (14 * 24 * 60 * 60 * 1000));

            await client.query(
                `INSERT INTO invoices (
                    trip_id,
                    invoice_number,
                    invoice_date,
                    due_date,
                    subtotal,
                    gst_amount,
                    total_amount,
                    payment_status,
                    amount_paid,
                    created_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [
                    trip.trip_id,
                    `RKS-INV-24-${String(index + 1).padStart(4, '0')}`,
                    isoDate(invoiceDate),
                    isoDate(dueDate),
                    subtotal,
                    gstAmount,
                    totalAmount,
                    status,
                    amountPaid,
                    invoiceDate
                ]
            );
        }

        const tripByLr = new Map(seededTrips.map((trip) => [trip.lr_number, trip]));

        const bookingRows = [
            {
                customer_name: 'Apex Foods Pvt Ltd',
                contact_number: '9884011001',
                pickup_location: 'Bangalore',
                destination: 'Mangalore',
                load_type: 'Packaged food',
                weight: 11.5,
                pickup_date: isoDate(daysFromNow(1)),
                delivery_deadline: isoDate(daysFromNow(3)),
                offered_price: 38500,
                status: 'pending',
                approved_trip_lr: null
            },
            {
                customer_name: 'Velan Textiles',
                contact_number: '9884011002',
                pickup_location: 'Chennai',
                destination: 'Coimbatore',
                load_type: 'Cotton bales',
                weight: 14,
                pickup_date: isoDate(daysFromNow(2)),
                delivery_deadline: isoDate(daysFromNow(4)),
                offered_price: 61200,
                status: 'pending',
                approved_trip_lr: null
            },
            {
                customer_name: 'NorthGate Steel',
                contact_number: '9884011003',
                pickup_location: 'Hyderabad',
                destination: 'Nagpur',
                load_type: 'Steel coils',
                weight: 17.25,
                pickup_date: isoDate(daysFromNow(2)),
                delivery_deadline: isoDate(daysFromNow(5)),
                offered_price: 74800,
                status: 'pending',
                approved_trip_lr: null
            },
            {
                customer_name: 'Sri Lakshmi Traders',
                contact_number: '9884011004',
                pickup_location: 'Erode',
                destination: 'Vizag',
                load_type: 'FMCG mixed load',
                weight: 12,
                pickup_date: isoDate(daysAgo(1)),
                delivery_deadline: isoDate(daysFromNow(2)),
                offered_price: 102000,
                status: 'approved',
                approved_trip_lr: 'RKS-24007'
            },
            {
                customer_name: 'Sunrise Chemicals',
                contact_number: '9884011005',
                pickup_location: 'Trichy',
                destination: 'Mysore',
                load_type: 'Chemical drums',
                weight: 9.8,
                pickup_date: isoDate(daysAgo(2)),
                delivery_deadline: isoDate(daysAgo(1)),
                offered_price: 36500,
                status: 'rejected',
                approved_trip_lr: null
            }
        ];

        for (const booking of bookingRows) {
            const pickupCoord = resolveCityCoordinate(booking.pickup_location);
            const destinationCoord = resolveCityCoordinate(booking.destination);

            await client.query(
                `INSERT INTO booking_requests (
                    customer_name,
                    contact_number,
                    pickup_location,
                    destination,
                    load_type,
                    weight,
                    pickup_date,
                    delivery_deadline,
                    offered_price,
                    status,
                    pickup_latitude,
                    pickup_longitude,
                    destination_latitude,
                    destination_longitude,
                    approved_trip_id,
                    created_at,
                    updated_at
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
                )`,
                [
                    booking.customer_name,
                    booking.contact_number,
                    booking.pickup_location,
                    booking.destination,
                    booking.load_type,
                    booking.weight,
                    booking.pickup_date,
                    booking.delivery_deadline,
                    booking.offered_price,
                    booking.status,
                    pickupCoord.latitude,
                    pickupCoord.longitude,
                    destinationCoord.latitude,
                    destinationCoord.longitude,
                    booking.approved_trip_lr ? tripByLr.get(booking.approved_trip_lr)?.trip_id || null : null,
                    booking.status === 'pending' ? daysAgo(1) : daysAgo(2),
                    new Date()
                ]
            );
        }

        const runningTrips = seededTrips.filter((trip) => trip.status === 'Running');
        const alertRows = [
            {
                trip: runningTrips[0],
                alert_type: 'overspeed',
                description: `Overspeed detected for ${runningTrips[0].lr_number} at 86.4 km/h`
            },
            {
                trip: runningTrips[0],
                alert_type: 'delay_risk',
                description: `${runningTrips[0].lr_number} has elevated delay risk due to congestion on NH44`
            },
            {
                trip: runningTrips[1],
                alert_type: 'route_deviation',
                description: `${runningTrips[1].lr_number} deviated 1.9 km from planned route`
            },
            {
                trip: tripByLr.get('RKS-24003'),
                alert_type: 'fuel_anomaly',
                description: 'Fuel usage exceeded expected threshold by more than 20%'
            }
        ];

        for (const alert of alertRows) {
            await client.query(
                `INSERT INTO alerts (truck_id, trip_id, alert_type, description, created_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    alert.trip.truck_id,
                    alert.trip.trip_id,
                    alert.alert_type,
                    alert.description,
                    hoursAgo(2)
                ]
            );
        }

        const adminUserId = userIdByEmail.get('admin@rks.com');
        const managerUserId = userIdByEmail.get('manager@rks.com');

        const notifications = [
            {
                user_id: adminUserId,
                message: `Trip ${runningTrips[0].lr_number} started and is now Running`,
                type: 'trip_started',
                related_trip_id: runningTrips[0].trip_id,
                is_read: false,
                created_at: hoursAgo(10)
            },
            {
                user_id: adminUserId,
                message: `Trip ${runningTrips[1].lr_number} raised route deviation alert`,
                type: 'alert',
                related_trip_id: runningTrips[1].trip_id,
                is_read: false,
                created_at: hoursAgo(3)
            },
            {
                user_id: managerUserId,
                message: '3 booking requests are awaiting approval',
                type: 'booking_pending',
                related_trip_id: null,
                is_read: false,
                created_at: hoursAgo(1)
            },
            {
                user_id: userIdByEmail.get('driver.abi@rks.com'),
                message: `Assigned to ${runningTrips[0].lr_number}: ${runningTrips[0].source} to ${runningTrips[0].destination}`,
                type: 'trip_assigned',
                related_trip_id: runningTrips[0].trip_id,
                is_read: true,
                created_at: hoursAgo(20)
            },
            {
                user_id: userIdByEmail.get('driver.ravi@rks.com'),
                message: `Assigned to ${runningTrips[1].lr_number}: ${runningTrips[1].source} to ${runningTrips[1].destination}`,
                type: 'trip_assigned',
                related_trip_id: runningTrips[1].trip_id,
                is_read: true,
                created_at: hoursAgo(11)
            }
        ];

        for (const notification of notifications) {
            await client.query(
                `INSERT INTO notifications (user_id, message, type, is_read, related_trip_id, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    notification.user_id,
                    notification.message,
                    notification.type,
                    notification.is_read,
                    notification.related_trip_id,
                    notification.created_at
                ]
            );
        }

        await client.query('COMMIT');

        console.log('✅ Full platform seed completed successfully.');
        console.log('Summary:');
        console.log(`  Users: ${users.length}`);
        console.log(`  Trucks: ${trucks.length}`);
        console.log(`  Drivers: ${drivers.length}`);
        console.log(`  Trips: ${seededTrips.length}`);
        console.log(`  Completed trips: ${completedTrips.length}`);
        console.log(`  Running trips: ${runningTrips.length}`);
        console.log(`  Pending bookings: ${bookingRows.filter((item) => item.status === 'pending').length}`);
        console.log('Login credentials:');
        console.log(`  Admin: admin@rks.com / ${DEFAULT_PASSWORD}`);
        console.log(`  Manager: manager@rks.com / ${DEFAULT_PASSWORD}`);
        console.log('  Drivers: driver.*@rks.com / 1234');
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ Full platform seed failed:', error.message);
        console.error(error);
        process.exitCode = 1;
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
    }
}

seed();
