import apiClient from '../api/client';
import { microserviceClients } from '../api/microserviceClients';

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values) {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }

    const sum = values.reduce((acc, value) => acc + toNumber(value, 0), 0);
    return sum / values.length;
}

function normalizeTripId(value) {
    if (value === null || value === undefined) {
        return null;
    }

    return String(value);
}

function normalizeLiveVehicle(vehicle) {
    const tripId = normalizeTripId(vehicle.trip_id ?? vehicle.tripId);
    const truckId = vehicle.truck_id ?? vehicle.truckId ?? vehicle.vehicleId ?? vehicle.truck_number ?? 'UNKNOWN';

    return {
        truck_id: String(truckId),
        truck_number: vehicle.truck_number || String(truckId),
        trip_id: tripId,
        latitude: toNumber(vehicle.latitude, 0),
        longitude: toNumber(vehicle.longitude, 0),
        speed: toNumber(vehicle.speed, 0),
        timestamp: vehicle.timestamp || new Date().toISOString(),
        trip_progress: toNumber(vehicle.trip_progress, 0),
        distance_travelled: toNumber(vehicle.distance_travelled, 0),
        trip_distance: toNumber(vehicle.trip_distance, 0)
    };
}

function normalizeRoute(route) {
    if (!Array.isArray(route)) {
        return [];
    }

    return route
        .map((point) => ({
            latitude: toNumber(point.latitude, NaN),
            longitude: toNumber(point.longitude, NaN)
        }))
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
}

function normalizeGpsHistoryRoute(gpsLogs) {
    if (!Array.isArray(gpsLogs)) {
        return [];
    }

    return normalizeRoute(
        gpsLogs.map((point) => ({
            latitude: point?.latitude,
            longitude: point?.longitude
        }))
    );
}

function estimateTrafficLevel(currentSpeed) {
    if (currentSpeed <= 20) {
        return 0.85;
    }

    if (currentSpeed <= 40) {
        return 0.55;
    }

    return 0.3;
}

function estimateDelayRiskPercentage(etaMinutes, progressPercent) {
    const safeEta = Math.max(0, toNumber(etaMinutes, 0));
    const safeProgress = Math.min(100, Math.max(0, toNumber(progressPercent, 0)));

    if (safeEta <= 0) {
        return 0;
    }

    const normalizedEta = Math.min(safeEta / 360, 1);
    const progressPenalty = Math.max(0, 1 - (safeProgress / 100));
    return Number(((normalizedEta * 70) + (progressPenalty * 30)).toFixed(2));
}

async function fetchLiveFromMicroservices() {
    const response = await microserviceClients.tracking.get('/tracking/live');
    const rows = response.data?.data || [];
    return rows.map(normalizeLiveVehicle).filter((row) => row.trip_id);
}

async function fetchLiveFromBackendMock() {
    const response = await apiClient.get('/tracking/live');
    const rows = response.data?.data || [];
    return rows.map(normalizeLiveVehicle).filter((row) => row.trip_id);
}

async function fetchTripFromMicroservices(tripId) {
    const response = await microserviceClients.tracking.get(`/tracking/trip/${encodeURIComponent(String(tripId))}`);
    return response.data?.data || null;
}

async function fetchTripFromBackendMock(tripId) {
    const response = await apiClient.get(`/tracking/trip/${encodeURIComponent(String(tripId))}`);
    return response.data?.data || null;
}

async function fetchTripWithFallback(tripId) {
    try {
        const trip = await fetchTripFromMicroservices(tripId);
        if (trip) {
            return trip;
        }
    } catch {
        // Continue to backend fallback.
    }

    return fetchTripFromBackendMock(tripId);
}

async function getMlPrediction({ distanceRemaining, currentSpeed, historicalAvgSpeed, tripDistance }) {
    const normalizedDistance = Math.max(0, toNumber(distanceRemaining, 0));
    const normalizedSpeed = Math.max(0, toNumber(currentSpeed, 0));
    const normalizedHistorical = Math.max(0, toNumber(historicalAvgSpeed, 0));
    const normalizedTripDistance = Math.max(0, toNumber(tripDistance, 0));

    const etaResponse = await microserviceClients.ml.post('/predict/eta', {
        distance_remaining: normalizedDistance,
        current_speed: normalizedSpeed,
        historical_avg_speed: normalizedHistorical,
        historical_speed: normalizedHistorical,
        trip_distance: normalizedTripDistance,
        road_type: 'highway'
    });

    const etaMinutes = toNumber(etaResponse.data?.eta_minutes, NaN);
    if (!Number.isFinite(etaMinutes)) {
        return null;
    }

    const plannedArrival = new Date(Date.now() + (Math.max(etaMinutes, 30) * 1.2 * 60000)).toISOString();

    const delayResponse = await microserviceClients.ml.post('/predict/delay', {
        planned_arrival_time: plannedArrival,
        predicted_eta: etaMinutes,
        trip_distance: normalizedTripDistance,
        traffic_level: estimateTrafficLevel(normalizedSpeed)
    });

    const delayRiskFromPercentage = toNumber(delayResponse.data?.delay_risk_percentage, NaN);
    const delayRiskFromProbability = toNumber(
        delayResponse.data?.delay_probability ?? delayResponse.data?.delay_risk,
        NaN
    );

    const delayRiskPercentage = Number.isFinite(delayRiskFromPercentage)
        ? delayRiskFromPercentage
        : Number.isFinite(delayRiskFromProbability)
            ? delayRiskFromProbability * 100
            : NaN;

    return {
        etaMinutes,
        delayRiskPercentage: Number.isFinite(delayRiskPercentage)
            ? Number(delayRiskPercentage.toFixed(2))
            : null
    };
}

function buildFallbackInsight(vehicle, trip = null) {
    const preciseRoute = normalizeRoute(trip?.route);
    const historyRoute = normalizeGpsHistoryRoute(trip?.gps_logs);
    const routeForMap = preciseRoute.length > 1 ? preciseRoute : historyRoute;

    const totalDistanceKm = toNumber(
        trip?.total_route_distance_km,
        toNumber(trip?.trip_distance, toNumber(vehicle.trip_distance, 0))
    );

    const travelledDistanceKm = toNumber(
        trip?.distance_travelled_km,
        toNumber(trip?.distance_travelled, toNumber(vehicle.distance_travelled, 0))
    );

    const distanceRemainingKm = Math.max(totalDistanceKm - travelledDistanceKm, 0);
    const currentSpeed = toNumber(vehicle.speed, 0);
    const fallbackSpeed = Math.max(currentSpeed, 25);

    const progressPercentFromTrip = toNumber(trip?.progress_percent, NaN);
    const progressPercent = Number.isFinite(progressPercentFromTrip)
        ? progressPercentFromTrip
        : toNumber(trip?.progress, toNumber(vehicle.trip_progress, 0) * 100);

    const etaFromTrip = toNumber(trip?.eta_minutes, NaN);
    const etaMinutes = Number.isFinite(etaFromTrip)
        ? etaFromTrip
        : (distanceRemainingKm > 0 ? (distanceRemainingKm / fallbackSpeed) * 60 : 0);

    const delayRiskFromTrip = toNumber(trip?.delay_risk_percentage, NaN);
    const delayRiskPercentage = Number.isFinite(delayRiskFromTrip)
        ? delayRiskFromTrip
        : estimateDelayRiskPercentage(etaMinutes, progressPercent);

    return {
        trip_id: normalizeTripId(trip?.trip_id ?? vehicle.trip_id),
        truck_id: String(trip?.truck_id ?? vehicle.truck_id),
        source: trip?.source || vehicle.source || 'Unknown Source',
        destination: trip?.destination || vehicle.destination || 'Unknown Destination',
        progress_percent: Number(Math.max(0, Math.min(progressPercent, 100)).toFixed(2)),
        eta_minutes: Number(Math.max(0, etaMinutes).toFixed(2)),
        delay_risk_percentage: Number(Math.max(0, Math.min(delayRiskPercentage, 100)).toFixed(2)),
        route: routeForMap
    };
}

export async function ensureTrackingSimulation() {
    const status = {
        microserviceMockGps: false,
        backendMockGps: false
    };

    const [microResult, backendResult] = await Promise.allSettled([
        (async () => {
            await microserviceClients.mockGps.post('/mock-gps/start');
            await microserviceClients.mockGps.post('/mock-gps/tick', {});
            status.microserviceMockGps = true;
        })(),
        (async () => {
            await apiClient.post('/tracking/bootstrap');
            status.backendMockGps = true;
        })()
    ]);

    if (microResult.status === 'rejected' && backendResult.status === 'rejected') {
        return status;
    }

    return status;
}

export async function fetchLiveVehiclesWithFallback() {
    try {
        const microserviceRows = await fetchLiveFromMicroservices();
        if (microserviceRows.length > 0) {
            return {
                source: 'microservices',
                liveVehicles: microserviceRows
            };
        }
    } catch {
        // Continue to backend fallback.
    }

    await apiClient.post('/tracking/bootstrap').catch(() => null);

    const backendRows = await fetchLiveFromBackendMock();
    return {
        source: 'backend-mock',
        liveVehicles: backendRows
    };
}

export async function buildTripInsightsFromVehicles(vehicles) {
    const activeVehicles = (vehicles || []).filter((vehicle) => vehicle.trip_id);
    const insights = [];

    for (const vehicle of activeVehicles) {
        const fallbackInsight = buildFallbackInsight(vehicle, null);

        try {
            const trip = await fetchTripWithFallback(vehicle.trip_id);
            if (!trip) {
                insights.push(fallbackInsight);
                continue;
            }

            const gpsLogs = Array.isArray(trip.gps_logs) ? trip.gps_logs : [];
            const speedSamples = gpsLogs
                .map((point) => toNumber(point.speed, 0))
                .filter((speed) => speed > 0);

            const currentSpeed = toNumber(vehicle.speed, 0);
            const historicalAvgSpeed = speedSamples.length > 0
                ? average(speedSamples)
                : Math.max(currentSpeed, 35);

            const totalDistanceKm = toNumber(trip.total_route_distance_km, toNumber(trip.trip_distance, 0));
            const travelledDistanceKm = toNumber(trip.distance_travelled_km, toNumber(trip.distance_travelled, 0));
            const distanceRemainingKm = Math.max(totalDistanceKm - travelledDistanceKm, 0);

            let etaMinutes = toNumber(trip.eta_minutes, NaN);
            let delayRiskPercentage = toNumber(trip.delay_risk_percentage, NaN);

            if (!Number.isFinite(etaMinutes) || !Number.isFinite(delayRiskPercentage)) {
                try {
                    const prediction = await getMlPrediction({
                        distanceRemaining: distanceRemainingKm,
                        currentSpeed,
                        historicalAvgSpeed,
                        tripDistance: totalDistanceKm
                    });

                    if (prediction) {
                        etaMinutes = prediction.etaMinutes;
                        delayRiskPercentage = prediction.delayRiskPercentage;
                    }
                } catch {
                    // Continue to heuristic fallback.
                }
            }

            if (!Number.isFinite(etaMinutes)) {
                const fallbackSpeed = Math.max(currentSpeed || historicalAvgSpeed || 0, 25);
                etaMinutes = distanceRemainingKm > 0
                    ? (distanceRemainingKm / fallbackSpeed) * 60
                    : 0;
            }

            if (!Number.isFinite(delayRiskPercentage)) {
                delayRiskPercentage = estimateDelayRiskPercentage(etaMinutes, toNumber(trip.progress_percent, 0));
            }

            insights.push(
                buildFallbackInsight(vehicle, {
                    ...trip,
                    eta_minutes: Number(etaMinutes.toFixed(2)),
                    delay_risk_percentage: Number(delayRiskPercentage.toFixed(2))
                })
            );
        } catch {
            // Keep vehicle visible even when trip detail fetch fails.
            insights.push(fallbackInsight);
        }
    }

    return insights;
}

export function formatTrackingSourceLabel(source) {
    if (source === 'microservices') {
        return 'Microservices GPS Feed';
    }

    if (source === 'backend-mock') {
        return 'Backend Mock GPS Feed';
    }

    return 'Unknown Tracking Source';
}
