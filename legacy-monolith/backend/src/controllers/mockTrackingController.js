const pool = require('../config/db');
const { mockTrackingProvider, haversineDistanceKm } = require('../services/mockTrackingProvider');

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OPENROUTESERVICE_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/driving-car';
const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';
const ROUTE_TIMEOUT_MS = Number(process.env.BACKEND_TRACKING_ROUTE_TIMEOUT_MS || 12000);
const MIN_ROUTE_POINTS_FOR_EXTERNAL = Number(process.env.BACKEND_TRACKING_ROUTE_MIN_POINTS || 24);
const HISTORY_ROUTE_MAX_WAYPOINTS = Number(process.env.BACKEND_TRACKING_HISTORY_ROUTE_MAX_WAYPOINTS || 48);

const geocodeCache = new Map();
const externalRouteCache = new Map();
const roadwayRouteCache = new Map();

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function isActiveStatus(status) {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'running' || normalized === 'in_progress';
}

function parseRoutePolyline(rawPolyline) {
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
                    return {
                        longitude: toNumber(point[0], NaN),
                        latitude: toNumber(point[1], NaN)
                    };
                }

                if (point && point.longitude !== undefined && point.latitude !== undefined) {
                    return {
                        longitude: toNumber(point.longitude, NaN),
                        latitude: toNumber(point.latitude, NaN)
                    };
                }

                return null;
            })
            .filter((point) => point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
    } catch {
        return [];
    }
}

function normalizePoint(point) {
    if (!point) {
        return null;
    }

    const latitude = toNumber(point.latitude, NaN);
    const longitude = toNumber(point.longitude, NaN);
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

    const fallbackDistanceKm = sumDistanceKm(route);
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
    return JSON.stringify(route.map((point) => [point.longitude, point.latitude]));
}

function routeIsWeak(route) {
    return !Array.isArray(route) || route.length < MIN_ROUTE_POINTS_FOR_EXTERNAL;
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
                    'User-Agent': 'rks-backend-tracking/1.0'
                }
            }
        );

        const hit = Array.isArray(payload) ? payload[0] : null;
        const point = hit ? normalizePoint({ latitude: hit.lat, longitude: hit.lon }) : null;
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
                    'User-Agent': 'rks-backend-tracking/1.0'
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
                    'User-Agent': 'rks-backend-tracking/1.0'
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

function buildRouteCacheKey({ source, destination, startHint, endHint }) {
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

    const cacheKey = buildRouteCacheKey({
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

    let route = null;
    if (routeEngine === 'auto' || routeEngine === 'openrouteservice' || routeEngine === 'ors') {
        route = await fetchOpenRouteServiceRoute(start, end);
    }

    if (!route && (routeEngine === 'auto' || routeEngine === 'osrm' || routeEngine === 'openrouteservice' || routeEngine === 'ors')) {
        route = await fetchOsrmRoute(start, end);
    }

    if (!route || route.length < 2) {
        return null;
    }

    externalRouteCache.set(cacheKey, route);
    return route;
}

async function upsertTripRoute(tripId, route) {
    if (!Array.isArray(route) || route.length < 2) {
        return;
    }

    const routeDistance = Number(sumDistanceKm(route).toFixed(2));
    const estimatedMinutes = Number(((routeDistance / 42) * 60).toFixed(2));
    const polyline = routeToPolyline(route);

    await pool.query(
        `UPDATE trips
         SET route_polyline = $1,
             distance_km = GREATEST(COALESCE(distance_km, 0), $3)
         WHERE trip_id = $2`,
        [polyline, tripId, routeDistance]
    );

    await pool.query(
        `INSERT INTO trip_routes (trip_id, route_polyline, distance, estimated_time)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (trip_id)
         DO UPDATE SET route_polyline = EXCLUDED.route_polyline,
                       distance = EXCLUDED.distance,
                       estimated_time = EXCLUDED.estimated_time`,
        [tripId, polyline, routeDistance, estimatedMinutes]
    );
}

async function enrichRouteIfWeak({ tripId, source, destination, route, logs }) {
    if (!routeIsWeak(route)) {
        return route;
    }

    const startHint = route[0] || normalizePoint(logs[0]);
    const endHint = route[route.length - 1] || normalizePoint(logs[logs.length - 1]);

    const externalRoute = await fetchExternalRouteForTrip({
        source,
        destination,
        startHint,
        endHint
    });

    if (Array.isArray(externalRoute) && externalRoute.length > Math.max(route.length, 2)) {
        await upsertTripRoute(tripId, externalRoute);
        return externalRoute;
    }

    return route;
}

async function resolveRoadSnappedHistory(logs) {
    const historyRoute = buildHistoryRoute(logs);
    if (historyRoute.length < 2) {
        return {
            route: historyRoute,
            distanceKm: Number(sumDistanceKm(historyRoute).toFixed(3)),
            durationMinutes: null,
            source: 'gps_history'
        };
    }

    const details = await fetchRoadwayRouteDetails(historyRoute);
    if (!details) {
        return {
            route: historyRoute,
            distanceKm: Number(sumDistanceKm(historyRoute).toFixed(3)),
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

function sumDistanceKm(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return 0;
    }

    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += haversineDistanceKm(points[index - 1], points[index]);
    }

    return total;
}

function estimateEtaMinutes(distanceRemainingKm, currentSpeedKmph) {
    if (distanceRemainingKm <= 0) {
        return 0;
    }

    const fallbackSpeed = Math.max(currentSpeedKmph, 25);
    return Number(((distanceRemainingKm / fallbackSpeed) * 60).toFixed(2));
}

function estimateDelayRiskPercentage(etaMinutes, progressPercent) {
    if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) {
        return 0;
    }

    const normalizedEta = Math.min(etaMinutes / 360, 1);
    const progressPenalty = Math.max(0, 1 - (Math.max(0, Math.min(progressPercent, 100)) / 100));
    return Number(((normalizedEta * 70) + (progressPenalty * 30)).toFixed(2));
}

async function getTripGpsLogs(tripId) {
    const result = await pool.query(
        `SELECT latitude, longitude, COALESCE(speed_kmph, 0) AS speed, recorded_at
         FROM gps_logs
         WHERE trip_id = $1
         ORDER BY recorded_at ASC`,
        [tripId]
    );

    return result.rows.map((row) => ({
        latitude: toNumber(row.latitude, 0),
        longitude: toNumber(row.longitude, 0),
        speed: toNumber(row.speed, 0),
        timestamp: row.recorded_at
    }));
}

async function getRecordTripSnapshot(tripId) {
    const tripResult = await pool.query(
        `SELECT
            t.trip_id,
            t.truck_id,
            t.source,
            t.destination,
            t.status,
            t.distance_km,
            COALESCE(t.gps_distance_km, 0) AS gps_distance_km,
            t.start_time,
            t.created_at,
            tk.truck_number,
            COALESCE(trp.route_polyline, t.route_polyline) AS route_polyline,
            COALESCE(trp.distance, 0) AS route_distance
         FROM trips t
         LEFT JOIN trucks tk ON tk.truck_id = t.truck_id
         LEFT JOIN trip_routes trp ON trp.trip_id = t.trip_id
         WHERE t.trip_id = $1`,
        [tripId]
    );

    if (tripResult.rows.length === 0) {
        return null;
    }

    const trip = tripResult.rows[0];
    const logs = await getTripGpsLogs(tripId);
    const historyRoute = buildHistoryRoute(logs);
    const isActiveTrip = isActiveStatus(trip.status);
    let route = historyRoute;
    let routeSource = 'gps_history';
    let routeDistanceFromPolyline = 0;

    if (isActiveTrip) {
        const historyDetails = await resolveRoadSnappedHistory(logs);
        route = historyDetails.route;
        routeSource = historyDetails.source;
        routeDistanceFromPolyline = toNumber(historyDetails.distanceKm, 0);
    } else {
        const routePolyline = parseRoutePolyline(trip.route_polyline);

        route = routePolyline.length > 0 ? routePolyline : historyRoute;
        route = await enrichRouteIfWeak({
            tripId,
            source: trip.source,
            destination: trip.destination,
            route,
            logs
        });

        routeDistanceFromPolyline = sumDistanceKm(route);
    }

    const routeDistanceFromRecord = toNumber(trip.route_distance, 0) || toNumber(trip.distance_km, 0);
    const totalRouteDistanceKm = routeDistanceFromPolyline > 0 ? routeDistanceFromPolyline : routeDistanceFromRecord;

    const distanceFromLogs = sumDistanceKm(logs);
    const distanceFromTripGps = toNumber(trip.gps_distance_km, 0);
    const distanceTravelledKm = Math.max(distanceFromLogs, distanceFromTripGps);

    const latestGpsPoint = logs.length > 0
        ? logs[logs.length - 1]
        : (route.length > 0
            ? {
                latitude: route[0].latitude,
                longitude: route[0].longitude,
                speed: 0,
                timestamp: trip.start_time || trip.created_at || new Date().toISOString()
            }
            : null);

    const currentSpeedKmph = latestGpsPoint ? toNumber(latestGpsPoint.speed, 0) : 0;
    const roadEtaMetrics = isActiveTrip && latestGpsPoint
        ? await resolveRoadEtaMetrics({
            currentPoint: latestGpsPoint,
            destination: trip.destination
        })
        : null;

    const distanceRemainingFromRoad = toNumber(roadEtaMetrics?.distanceRemainingKm, NaN);
    const distanceRemainingKm = Number.isFinite(distanceRemainingFromRoad)
        ? Math.max(distanceRemainingFromRoad, 0)
        : Math.max(totalRouteDistanceKm - distanceTravelledKm, 0);

    const normalizedTotalRouteDistanceKm = Math.max(
        totalRouteDistanceKm,
        distanceTravelledKm,
        distanceTravelledKm + distanceRemainingKm
    );

    const progress = normalizedTotalRouteDistanceKm > 0
        ? Math.min(distanceTravelledKm / normalizedTotalRouteDistanceKm, 1)
        : 0;

    const progressPercent = progress * 100;
    const etaFromRoad = toNumber(roadEtaMetrics?.etaMinutes, NaN);
    const etaMinutes = isActiveTrip
        ? (Number.isFinite(etaFromRoad)
            ? etaFromRoad
            : estimateEtaMinutes(distanceRemainingKm, currentSpeedKmph))
        : 0;

    return {
        trip_id: trip.trip_id,
        truck_id: trip.truck_id,
        truck_number: trip.truck_number || String(trip.truck_id),
        source: trip.source,
        destination: trip.destination,
        status: trip.status,
        route,
        gps_logs: logs,
        distance_travelled_km: Number(distanceTravelledKm.toFixed(3)),
        total_route_distance_km: Number(normalizedTotalRouteDistanceKm.toFixed(3)),
        progress: Number(progress.toFixed(4)),
        progress_percent: Number(progressPercent.toFixed(2)),
        eta_minutes: Number(etaMinutes.toFixed(2)),
        delay_risk_percentage: Number(estimateDelayRiskPercentage(etaMinutes, progressPercent).toFixed(2)),
        route_source: routeSource,
        eta_source: Number.isFinite(etaFromRoad) ? 'roadway' : 'heuristic',
        latest_gps_point: latestGpsPoint,
        current_speed_kmph: Number(currentSpeedKmph.toFixed(1))
    };
}

async function getLiveRowsFromRecords() {
    const runningResult = await pool.query(
        `SELECT trip_id
         FROM trips
         WHERE LOWER(status) IN ('running', 'in_progress')
         ORDER BY trip_id ASC`
    );

    const data = [];

    for (const row of runningResult.rows) {
        const snapshot = await getRecordTripSnapshot(Number(row.trip_id));
        if (!snapshot || !snapshot.latest_gps_point) {
            continue;
        }

        const latitude = toNumber(snapshot.latest_gps_point.latitude, NaN);
        const longitude = toNumber(snapshot.latest_gps_point.longitude, NaN);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            continue;
        }

        data.push({
            truck_id: snapshot.truck_id,
            truck_number: snapshot.truck_number,
            trip_id: snapshot.trip_id,
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6)),
            speed: snapshot.current_speed_kmph,
            timestamp: snapshot.latest_gps_point.timestamp || new Date().toISOString(),
            trip_progress: snapshot.progress,
            distance_travelled: snapshot.distance_travelled_km,
            trip_distance: snapshot.total_route_distance_km
        });
    }

    return data;
}

const MockTrackingController = {
    bootstrapTracking(req, res, next) {
        try {
            const startedTrips = mockTrackingProvider.bootstrapTracking();
            res.json({ success: true, count: startedTrips.length, data: startedTrips });
        } catch (error) {
            next(error);
        }
    },

    async getTrackingLive(req, res, next) {
        try {
            if (String(req.query.source || '').toLowerCase() === 'mock') {
                const data = mockTrackingProvider.getTrackingLive();
                return res.json({ success: true, count: data.length, data, source: 'mock' });
            }

            const data = await getLiveRowsFromRecords();
            return res.json({ success: true, count: data.length, data, source: 'records' });
        } catch (error) {
            return next(error);
        }
    },

    async getTrackingTrip(req, res, next) {
        try {
            if (String(req.query.source || '').toLowerCase() === 'mock') {
                const data = mockTrackingProvider.getTrackingTrip(req.params.id);
                return res.json({ success: true, data, source: 'mock' });
            }

            const numericTripId = Number(req.params.id);
            if (!Number.isFinite(numericTripId)) {
                const data = mockTrackingProvider.getTrackingTrip(req.params.id);
                return res.json({ success: true, data, source: 'mock' });
            }

            const snapshot = await getRecordTripSnapshot(numericTripId);
            if (!snapshot) {
                return res.status(404).json({ success: false, message: 'Trip not found' });
            }

            return res.json({
                success: true,
                source: 'records',
                data: {
                    trip_id: snapshot.trip_id,
                    truck_id: snapshot.truck_id,
                    truck_number: snapshot.truck_number,
                    source: snapshot.source,
                    destination: snapshot.destination,
                    status: snapshot.status,
                    route: snapshot.route,
                    gps_logs: snapshot.gps_logs,
                    distance_travelled_km: snapshot.distance_travelled_km,
                    total_route_distance_km: snapshot.total_route_distance_km,
                    progress: snapshot.progress,
                    progress_percent: snapshot.progress_percent,
                    eta_minutes: snapshot.eta_minutes,
                    delay_risk_percentage: snapshot.delay_risk_percentage
                }
            });
        } catch (error) {
            return next(error);
        }
    },

    listVehicles(req, res, next) {
        try {
            const vehicles = mockTrackingProvider.getVehicles();
            res.json({ success: true, count: vehicles.length, data: vehicles });
        } catch (error) {
            next(error);
        }
    },

    getVehicleLocation(req, res, next) {
        try {
            const data = mockTrackingProvider.getVehicleLocation(req.params.id);
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    getVehicleRoute(req, res, next) {
        try {
            const route = mockTrackingProvider.getVehicleRoute(req.params.id);
            res.json({
                success: true,
                data: {
                    vehicleId: req.params.id,
                    totalPoints: route.length,
                    route
                }
            });
        } catch (error) {
            next(error);
        }
    },

    startTrip(req, res, next) {
        try {
            const { vehicleId } = req.body;

            if (!vehicleId) {
                return res.status(400).json({ success: false, message: 'vehicleId is required' });
            }

            const data = mockTrackingProvider.startTrip(vehicleId);
            return res.status(201).json({ success: true, data });
        } catch (error) {
            return next(error);
        }
    },

    endTrip(req, res, next) {
        try {
            const { tripId } = req.body;

            if (!tripId) {
                return res.status(400).json({ success: false, message: 'tripId is required' });
            }

            const data = mockTrackingProvider.endTrip(tripId);
            return res.json({ success: true, data });
        } catch (error) {
            return next(error);
        }
    },

    getTripProgress(req, res, next) {
        try {
            const data = mockTrackingProvider.getTripProgress(req.params.id);
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    getTripDistance(req, res, next) {
        try {
            const progress = mockTrackingProvider.getTripProgress(req.params.id);
            res.json({
                success: true,
                data: {
                    tripId: progress.tripId,
                    vehicleId: progress.vehicleId,
                    status: progress.status,
                    distanceTravelledKm: progress.distanceTravelledKm,
                    distanceRemainingKm: progress.distanceRemainingKm
                }
            });
        } catch (error) {
            next(error);
        }
    },

    getTripEta(req, res, next) {
        try {
            const data = mockTrackingProvider.getTripEta(req.params.id);
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    getTripHistory(req, res, next) {
        try {
            const data = mockTrackingProvider.getTripHistory(req.params.id);
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    getTripFuel(req, res, next) {
        try {
            const data = mockTrackingProvider.getTripFuel(req.params.id);
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = MockTrackingController;
