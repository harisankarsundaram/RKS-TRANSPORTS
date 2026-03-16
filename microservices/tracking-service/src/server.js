require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3105;
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OPENROUTESERVICE_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/driving-car';
const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = Number(process.env.TRACKING_ROUTE_TIMEOUT_MS || 12000);
const MIN_ROUTE_POINTS_FOR_EXTERNAL = Number(process.env.TRACKING_ROUTE_MIN_POINTS || 24);
const HISTORY_ROUTE_MAX_WAYPOINTS = Number(process.env.TRACKING_HISTORY_ROUTE_MAX_WAYPOINTS || 48);

const geocodeCache = new Map();
const externalRouteCache = new Map();
const roadwayRouteCache = new Map();

app.use(cors());
app.use(express.json());

function toRadians(deg) {
    return (deg * Math.PI) / 180;
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

function sumSegmentDistance(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return 0;
    }

    let sum = 0;
    for (let i = 1; i < points.length; i += 1) {
        sum += distanceKm(points[i - 1], points[i]);
    }
    return sum;
}

function isActiveTripStatus(status) {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'running' || normalized === 'in_progress';
}

function estimateDelayRiskPercentage(etaMinutes, progressPercent) {
    const safeEta = Math.max(0, Number(etaMinutes || 0));
    const safeProgress = Math.max(0, Math.min(100, Number(progressPercent || 0)));

    if (safeEta <= 0) {
        return 0;
    }

    const normalizedEta = Math.min(safeEta / 360, 1);
    const progressPenalty = Math.max(0, 1 - (safeProgress / 100));
    return Number(((normalizedEta * 70) + (progressPenalty * 30)).toFixed(2));
}

function normalizePoint(point) {
    if (!point) {
        return null;
    }

    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return {
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6))
    };
}

function buildHistoryRoute(logs) {
    if (!Array.isArray(logs)) {
        return [];
    }

    return logs
        .map((point) => normalizePoint(point))
        .filter((point) => point !== null);
}

function downsampleRoutePoints(points, maxPoints = HISTORY_ROUTE_MAX_WAYPOINTS) {
    if (!Array.isArray(points) || points.length <= maxPoints) {
        return Array.isArray(points) ? points : [];
    }

    const stride = Math.ceil(points.length / maxPoints);
    return points.filter((_, index) => {
        return index === 0 || index === points.length - 1 || index % stride === 0;
    });
}

function buildRouteCacheToken(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return '';
    }

    return points
        .map((point) => `${Number(point.latitude).toFixed(4)},${Number(point.longitude).toFixed(4)}`)
        .join('|');
}

function buildRouteDetails(route, summaryDistanceMeters, summaryDurationSeconds) {
    if (!Array.isArray(route) || route.length < 2) {
        return null;
    }

    const fallbackDistanceKm = sumSegmentDistance(route);
    const normalizedSummaryDistanceKm = Number(summaryDistanceMeters) / 1000;
    const normalizedDistanceKm = Number.isFinite(normalizedSummaryDistanceKm) && normalizedSummaryDistanceKm > 0
        ? normalizedSummaryDistanceKm
        : fallbackDistanceKm;

    const normalizedSummaryDurationMinutes = Number(summaryDurationSeconds) / 60;
    const normalizedDurationMinutes = Number.isFinite(normalizedSummaryDurationMinutes) && normalizedSummaryDurationMinutes >= 0
        ? normalizedSummaryDurationMinutes
        : null;

    return {
        route,
        distanceKm: Number(normalizedDistanceKm.toFixed(3)),
        durationMinutes: Number.isFinite(normalizedDurationMinutes)
            ? Number(normalizedDurationMinutes.toFixed(2))
            : null
    };
}

function routeToPolyline(route) {
    return JSON.stringify(
        route.map((point) => [Number(point.longitude), Number(point.latitude)])
    );
}

function routeIsWeak(route) {
    return !Array.isArray(route) || route.length < MIN_ROUTE_POINTS_FOR_EXTERNAL;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
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

async function geocodeLocation(locationText) {
    const normalizedText = String(locationText || '').trim();
    if (!normalizedText) {
        return null;
    }

    const cacheKey = normalizedText.toLowerCase();
    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey);
    }

    try {
        const query = new URLSearchParams({
            q: normalizedText,
            format: 'json',
            limit: '1'
        });

        const payload = await fetchJsonWithTimeout(
            `${NOMINATIM_ENDPOINT}?${query.toString()}`,
            {
                headers: {
                    'User-Agent': 'rks-tracking-service/1.0'
                }
            }
        );

        const hit = Array.isArray(payload) ? payload[0] : null;
        const point = hit
            ? normalizePoint({ latitude: hit.lat, longitude: hit.lon })
            : null;

        geocodeCache.set(cacheKey, point);
        return point;
    } catch {
        geocodeCache.set(cacheKey, null);
        return null;
    }
}

function normalizeRouteCoordinates(coordinates) {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    return coordinates
        .map((entry) => {
            if (!Array.isArray(entry) || entry.length < 2) {
                return null;
            }

            return normalizePoint({ longitude: entry[0], latitude: entry[1] });
        })
        .filter((point) => point !== null);
}

async function fetchOpenRouteServiceDirections(points) {
    const apiKey = String(process.env.OPENROUTESERVICE_API_KEY || process.env.REAL_GPS_API_KEY || '').trim();
    if (!apiKey) {
        return null;
    }

    const normalizedPoints = downsampleRoutePoints(
        (points || []).map((point) => normalizePoint(point)).filter((point) => point !== null),
        HISTORY_ROUTE_MAX_WAYPOINTS
    );

    if (normalizedPoints.length < 2) {
        return null;
    }

    try {
        const query = new URLSearchParams({
            api_key: apiKey,
            geometry_format: 'geojson'
        });

        const payload = await fetchJsonWithTimeout(
            `${OPENROUTESERVICE_ENDPOINT}?${query.toString()}`,
            {
                method: 'POST',
                headers: {
                    Accept: 'application/json, application/geo+json',
                    'Content-Type': 'application/json; charset=utf-8',
                    'User-Agent': 'rks-tracking-service/1.0'
                },
                body: JSON.stringify({
                    coordinates: normalizedPoints.map((point) => [point.longitude, point.latitude]),
                    instructions: false,
                    geometry_simplify: false
                })
            }
        );

        const geoJsonCoordinates = payload?.features?.[0]?.geometry?.coordinates;
        const legacyCoordinates = payload?.routes?.[0]?.geometry?.coordinates;
        const coordinates = Array.isArray(geoJsonCoordinates) ? geoJsonCoordinates : legacyCoordinates;
        const route = normalizeRouteCoordinates(coordinates);
        const summary = payload?.features?.[0]?.properties?.summary || payload?.routes?.[0]?.summary;

        return buildRouteDetails(route, summary?.distance, summary?.duration);
    } catch {
        return null;
    }
}

async function fetchOsrmDirections(points) {
    const normalizedPoints = downsampleRoutePoints(
        (points || []).map((point) => normalizePoint(point)).filter((point) => point !== null),
        HISTORY_ROUTE_MAX_WAYPOINTS
    );

    if (normalizedPoints.length < 2) {
        return null;
    }

    try {
        const query = new URLSearchParams({
            alternatives: 'false',
            overview: 'full',
            geometries: 'geojson',
            steps: 'false'
        });

        const coordinatesPath = normalizedPoints
            .map((point) => `${point.longitude},${point.latitude}`)
            .join(';');

        const payload = await fetchJsonWithTimeout(
            `${OSRM_ENDPOINT}/${coordinatesPath}?${query.toString()}`,
            {
                headers: {
                    'User-Agent': 'rks-tracking-service/1.0'
                }
            }
        );

        const route = normalizeRouteCoordinates(payload?.routes?.[0]?.geometry?.coordinates);
        const summary = payload?.routes?.[0];

        return buildRouteDetails(route, summary?.distance, summary?.duration);
    } catch {
        return null;
    }
}

async function fetchOpenRouteServiceRoute(start, end) {
    const details = await fetchOpenRouteServiceDirections([start, end]);
    return details?.route || null;
}

async function fetchOsrmRoute(start, end) {
    const details = await fetchOsrmDirections([start, end]);
    return details?.route || null;
}

async function fetchRoadwayRouteDetails(points) {
    const normalizedPoints = downsampleRoutePoints(
        (points || []).map((point) => normalizePoint(point)).filter((point) => point !== null),
        HISTORY_ROUTE_MAX_WAYPOINTS
    );

    if (normalizedPoints.length < 2) {
        return null;
    }

    const routeEngine = String(process.env.GPS_ROUTE_ENGINE || 'auto').toLowerCase();
    const cacheKey = `${routeEngine}::${buildRouteCacheToken(normalizedPoints)}`;
    if (roadwayRouteCache.has(cacheKey)) {
        return roadwayRouteCache.get(cacheKey);
    }

    let details = null;

    if (routeEngine === 'auto' || routeEngine === 'openrouteservice' || routeEngine === 'ors') {
        details = await fetchOpenRouteServiceDirections(normalizedPoints);
    }

    if (!details && (routeEngine === 'auto' || routeEngine === 'osrm' || routeEngine === 'openrouteservice' || routeEngine === 'ors')) {
        details = await fetchOsrmDirections(normalizedPoints);
    }

    if (details) {
        roadwayRouteCache.set(cacheKey, details);
    }

    return details;
}

function buildExternalRouteCacheKey({ source, destination, startHint, endHint }) {
    const sourceKey = String(source || '').trim().toLowerCase();
    const destinationKey = String(destination || '').trim().toLowerCase();

    const startToken = startHint
        ? `${Number(startHint.latitude).toFixed(4)},${Number(startHint.longitude).toFixed(4)}`
        : '';
    const endToken = endHint
        ? `${Number(endHint.latitude).toFixed(4)},${Number(endHint.longitude).toFixed(4)}`
        : '';

    return `${sourceKey || startToken || 'unknown-start'}::${destinationKey || endToken || 'unknown-end'}::${startToken}::${endToken}`;
}

async function fetchExternalRouteForTrip({ source, destination, startHint, endHint }) {
    const normalizedStartHint = normalizePoint(startHint);
    const normalizedEndHint = normalizePoint(endHint);

    const hasTextPair = Boolean(String(source || '').trim() && String(destination || '').trim());
    const hasCoordinatePair = Boolean(normalizedStartHint && normalizedEndHint);

    if (!hasTextPair && !hasCoordinatePair) {
        return null;
    }

    const cacheKey = buildExternalRouteCacheKey({
        source,
        destination,
        startHint: normalizedStartHint,
        endHint: normalizedEndHint
    });

    if (externalRouteCache.has(cacheKey)) {
        return externalRouteCache.get(cacheKey);
    }

    let start = normalizedStartHint;
    let end = normalizedEndHint;

    if ((!start || !end) && hasTextPair) {
        const [geocodedStart, geocodedEnd] = await Promise.all([
            geocodeLocation(source),
            geocodeLocation(destination)
        ]);

        start = start || geocodedStart;
        end = end || geocodedEnd;
    }

    if (!start || !end) {
        return null;
    }

    const routeEngine = String(process.env.GPS_ROUTE_ENGINE || 'auto').toLowerCase();
    let externalRoute = null;

    if (routeEngine === 'auto' || routeEngine === 'openrouteservice' || routeEngine === 'ors') {
        externalRoute = await fetchOpenRouteServiceRoute(start, end);
    }

    if (!externalRoute && (routeEngine === 'auto' || routeEngine === 'osrm' || routeEngine === 'openrouteservice' || routeEngine === 'ors')) {
        externalRoute = await fetchOsrmRoute(start, end);
    }

    if (!externalRoute || externalRoute.length < 2) {
        return null;
    }

    externalRouteCache.set(cacheKey, externalRoute);
    return externalRoute;
}

async function upsertTripRoute(tripId, route) {
    if (!Array.isArray(route) || route.length < 2) {
        return;
    }

    const routeDistanceKm = Number(sumSegmentDistance(route).toFixed(2));
    const estimatedMinutes = Number(((routeDistanceKm / 42) * 60).toFixed(2));
    const polyline = routeToPolyline(route);

    await pool.query(
        `UPDATE trips
         SET route_polyline = $1,
             distance_km = GREATEST(COALESCE(distance_km, 0), $3)
         WHERE trip_id = $2`,
        [polyline, tripId, routeDistanceKm]
    );

    await pool.query(
        `INSERT INTO trip_routes (trip_id, route_polyline, distance, estimated_time)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (trip_id)
         DO UPDATE SET route_polyline = EXCLUDED.route_polyline,
                       distance = EXCLUDED.distance,
                       estimated_time = EXCLUDED.estimated_time`,
        [tripId, polyline, routeDistanceKm, estimatedMinutes]
    );
}

async function resolveTripRoute({ trip, logs }) {
    const parsed = normalizePolyline(trip.route_polyline_table || trip.route_polyline);
    if (!routeIsWeak(parsed)) {
        return parsed;
    }

    const startHint = parsed[0] || normalizePoint(logs[0]);
    const endHint = parsed[parsed.length - 1] || normalizePoint(logs[logs.length - 1]);

    const externalRoute = await fetchExternalRouteForTrip({
        source: trip.source,
        destination: trip.destination,
        startHint,
        endHint
    });

    if (Array.isArray(externalRoute) && externalRoute.length > Math.max(parsed.length, 2)) {
        await upsertTripRoute(trip.trip_id, externalRoute);
        return externalRoute;
    }

    if (parsed.length > 1) {
        return parsed;
    }

    const logRoute = (logs || [])
        .map((point) => normalizePoint(point))
        .filter((point) => point !== null);

    return logRoute.length > 1 ? logRoute : parsed;
}

async function resolveRoadSnappedHistory(logs) {
    const historyRoute = buildHistoryRoute(logs);
    if (historyRoute.length < 2) {
        return {
            route: historyRoute,
            distanceKm: Number(sumSegmentDistance(historyRoute).toFixed(3)),
            durationMinutes: null,
            source: 'gps_history'
        };
    }

    const details = await fetchRoadwayRouteDetails(historyRoute);
    if (!details) {
        return {
            route: historyRoute,
            distanceKm: Number(sumSegmentDistance(historyRoute).toFixed(3)),
            durationMinutes: null,
            source: 'gps_history'
        };
    }

    return {
        ...details,
        source: 'road_snapped_history'
    };
}

async function resolveRoadEtaMetrics({ currentPoint, destination }) {
    const start = normalizePoint(currentPoint);
    const end = await geocodeLocation(destination);

    if (!start || !end) {
        return null;
    }

    const details = await fetchRoadwayRouteDetails([start, end]);
    if (!details) {
        return null;
    }

    return {
        distanceRemainingKm: Number(details.distanceKm),
        etaMinutes: Number.isFinite(details.durationMinutes)
            ? Number(details.durationMinutes)
            : null
    };
}

function normalizePolyline(rawPolyline) {
    if (!rawPolyline) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawPolyline);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((point) => {
                if (Array.isArray(point) && point.length >= 2) {
                    return { longitude: Number(point[0]), latitude: Number(point[1]) };
                }
                if (point && point.longitude !== undefined && point.latitude !== undefined) {
                    return { longitude: Number(point.longitude), latitude: Number(point.latitude) };
                }
                return null;
            })
            .filter((point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude));
    } catch (error) {
        return [];
    }
}

async function getTripPath(tripId) {
    const logsResult = await pool.query(
        `SELECT latitude, longitude, COALESCE(speed_kmph, 0) AS speed, recorded_at
         FROM gps_logs
         WHERE trip_id = $1
         ORDER BY recorded_at ASC`,
        [tripId]
    );

    return logsResult.rows.map((row) => ({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speed: Number(row.speed),
        timestamp: row.recorded_at
    }));
}

async function ensureSchema() {
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
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', service: 'tracking-service', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

app.get('/tracking/live', async (req, res) => {
    try {
        const latest = await pool.query(`
            SELECT
                t.trip_id,
                t.truck_id,
                t.source,
                t.destination,
                t.status AS trip_status,
                tr.truck_number,
                COALESCE(last_trip.latitude, last_truck.latitude) AS latitude,
                COALESCE(last_trip.longitude, last_truck.longitude) AS longitude,
                COALESCE(last_trip.speed_kmph, last_truck.speed_kmph, 0) AS speed,
                COALESCE(last_trip.recorded_at, last_truck.recorded_at, NOW()) AS timestamp,
                COALESCE(tr_route.route_polyline, t.route_polyline) AS route_polyline,
                COALESCE(tr_route.distance, t.distance_km, 0) AS trip_distance,
                COALESCE(t.gps_distance_km, 0) AS gps_distance_km
            FROM trips t
            LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
            LEFT JOIN trip_routes tr_route ON tr_route.trip_id = t.trip_id
            LEFT JOIN LATERAL (
                SELECT latitude, longitude, speed_kmph, recorded_at
                FROM gps_logs
                WHERE trip_id = t.trip_id
                ORDER BY recorded_at DESC
                LIMIT 1
            ) last_trip ON TRUE
            LEFT JOIN LATERAL (
                SELECT latitude, longitude, speed_kmph, recorded_at
                FROM gps_logs
                WHERE truck_id = t.truck_id
                ORDER BY recorded_at DESC
                LIMIT 1
            ) last_truck ON TRUE
            WHERE LOWER(t.status) IN ('running', 'in_progress')
            ORDER BY t.trip_id ASC
        `);

        const data = [];

        for (const item of latest.rows) {
            const latitude = Number(item.latitude);
            const longitude = Number(item.longitude);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                continue;
            }

            const tripPath = await getTripPath(item.trip_id);
            const routePolyline = normalizePolyline(item.route_polyline);
            const routeDistance = sumSegmentDistance(routePolyline);
            const distanceFromLogs = sumSegmentDistance(tripPath);
            const trackedDistance = Number(item.gps_distance_km || 0);
            const distanceTravelled = Math.max(distanceFromLogs, trackedDistance);
            const totalDistance = Math.max(Number(item.trip_distance || 0), routeDistance, distanceTravelled);
            const tripProgress = totalDistance > 0
                ? Math.min(distanceTravelled / totalDistance, 1)
                : 0;

            data.push({
                truck_id: Number(item.truck_id),
                truck_number: item.truck_number || String(item.truck_id),
                trip_id: Number(item.trip_id),
                latitude,
                longitude,
                speed: Number(item.speed || 0),
                timestamp: item.timestamp,
                trip_progress: Number(tripProgress.toFixed(4)),
                distance_travelled: Number(distanceTravelled.toFixed(3)),
                trip_distance: Number(totalDistance.toFixed(3))
            });
        }

        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/tracking/trip/:tripId', async (req, res) => {
    const tripId = Number(req.params.tripId);

    if (!Number.isFinite(tripId)) {
        return res.status(400).json({ success: false, message: 'Invalid trip id' });
    }

    try {
        const [tripResult, logResult] = await Promise.all([
            pool.query(
                `SELECT t.*, tr.route_polyline AS route_polyline_table, tr.distance AS route_distance
                 FROM trips t
                 LEFT JOIN trip_routes tr ON tr.trip_id = t.trip_id
                 WHERE t.trip_id = $1`,
                [tripId]
            ),
            pool.query(
                `SELECT latitude, longitude, COALESCE(speed_kmph, 0) AS speed, recorded_at
                 FROM gps_logs
                 WHERE trip_id = $1
                 ORDER BY recorded_at ASC`,
                [tripId]
            )
        ]);

        if (tripResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        const trip = tripResult.rows[0];
        const logs = logResult.rows.map((row) => ({
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            speed: Number(row.speed),
            timestamp: row.recorded_at
        }));

        const isActiveTrip = isActiveTripStatus(trip.status);
        const historyDetails = isActiveTrip ? await resolveRoadSnappedHistory(logs) : null;

        const routePolyline = isActiveTrip
            ? (historyDetails?.route || [])
            : await resolveTripRoute({ trip, logs });

        const routeDistance = isActiveTrip
            ? Number(historyDetails?.distanceKm || 0)
            : (routePolyline.length > 1
                ? sumSegmentDistance(routePolyline)
                : Number(trip.route_distance || trip.distance_km || 0));

        const distanceFromLogs = sumSegmentDistance(logs);
        const trackedDistance = Number(trip.gps_distance_km || 0);
        const travelledDistance = Math.max(distanceFromLogs, trackedDistance);
        const latestPoint = logs.length > 0 ? logs[logs.length - 1] : null;
        const latestSpeed = latestPoint ? Number(latestPoint.speed || 0) : 0;

        const roadEtaMetrics = isActiveTrip && latestPoint
            ? await resolveRoadEtaMetrics({
                currentPoint: latestPoint,
                destination: trip.destination
            })
            : null;

        const distanceRemainingFromRoad = Number(roadEtaMetrics?.distanceRemainingKm);
        const distanceRemaining = Number.isFinite(distanceRemainingFromRoad)
            ? Math.max(distanceRemainingFromRoad, 0)
            : Math.max(routeDistance - travelledDistance, 0);

        const totalDistance = Math.max(travelledDistance + distanceRemaining, routeDistance, travelledDistance);
        const progress = totalDistance > 0
            ? Math.min(1, travelledDistance / totalDistance)
            : 0;

        const etaFromRoad = Number(roadEtaMetrics?.etaMinutes);
        const etaMinutes = Number.isFinite(etaFromRoad)
            ? Number(etaFromRoad.toFixed(2))
            : (distanceRemaining > 0
                ? Number(((distanceRemaining / Math.max(latestSpeed, 25)) * 60).toFixed(2))
                : 0);
        const progressPercent = Number((progress * 100).toFixed(2));
        const delayRisk = estimateDelayRiskPercentage(etaMinutes, progressPercent);

        return res.json({
            success: true,
            data: {
                trip_id: trip.trip_id,
                truck_id: trip.truck_id,
                source: trip.source,
                destination: trip.destination,
                status: trip.status,
                route: routePolyline,
                gps_logs: logs,
                distance_travelled_km: Number(travelledDistance.toFixed(3)),
                total_route_distance_km: Number(totalDistance.toFixed(3)),
                progress: Number(progress.toFixed(4)),
                progress_percent: progressPercent,
                eta_minutes: etaMinutes,
                delay_risk_percentage: delayRisk,
                route_source: isActiveTrip ? (historyDetails?.source || 'gps_history') : 'planned_route',
                eta_source: Number.isFinite(etaFromRoad) ? 'roadway' : 'heuristic'
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`tracking-service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('tracking-service startup failed:', error);
        process.exit(1);
    });
