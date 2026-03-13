const GpsModel = require('../models/gpsModel');
const TripModel = require('../models/tripModel');
const EtaService = require('./etaService');

const KNOWN_COORDINATES = {
    ahmedabad: { latitude: 23.0225, longitude: 72.5714 },
    bangalore: { latitude: 12.9716, longitude: 77.5946 },
    bengaluru: { latitude: 12.9716, longitude: 77.5946 },
    bhubaneswar: { latitude: 20.2961, longitude: 85.8245 },
    chandigarh: { latitude: 30.7333, longitude: 76.7794 },
    chennai: { latitude: 13.0827, longitude: 80.2707 },
    coimbatore: { latitude: 11.0168, longitude: 76.9558 },
    delhi: { latitude: 28.6139, longitude: 77.2090 },
    goa: { latitude: 15.2993, longitude: 74.1240 },
    hyderabad: { latitude: 17.3850, longitude: 78.4867 },
    jaipur: { latitude: 26.9124, longitude: 75.7873 },
    kolkata: { latitude: 22.5726, longitude: 88.3639 },
    mumbai: { latitude: 19.0760, longitude: 72.8777 },
    mysore: { latitude: 12.2958, longitude: 76.6394 },
    pune: { latitude: 18.5204, longitude: 73.8567 },
    salem: { latitude: 11.6643, longitude: 78.1460 },
    sankari: { latitude: 11.4799, longitude: 77.8947 },
    surat: { latitude: 21.1702, longitude: 72.8311 },
    vijayawada: { latitude: 16.5062, longitude: 80.6480 }
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function normalizeLocationName(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ');
}

function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
}

function fallbackCoordinate(name) {
    const seed = hashString(normalizeLocationName(name));
    const latitude = 8 + ((seed % 2600) / 100);
    const longitude = 68 + (((seed >> 3) % 2200) / 100);

    return {
        latitude: clamp(latitude, 8, 34),
        longitude: clamp(longitude, 68, 90)
    };
}

function getLocationCoordinate(name) {
    const normalized = normalizeLocationName(name);
    return KNOWN_COORDINATES[normalized] || fallbackCoordinate(name);
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => degrees * (Math.PI / 180);
    const earthRadiusKm = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function interpolateCoordinate(start, end, progress) {
    const ratio = clamp(progress, 0, 1);
    return {
        latitude: start.latitude + ((end.latitude - start.latitude) * ratio),
        longitude: start.longitude + ((end.longitude - start.longitude) * ratio)
    };
}

function getVariationFactor(seed) {
    return 0.9 + ((hashString(String(seed)) % 21) / 100);
}

function getPlannedDistanceKm(trip, startCoordinate, endCoordinate) {
    const statedDistance = parseFloat(trip.distance_km) || 0;
    const geographicDistance = calculateDistanceKm(
        startCoordinate.latitude,
        startCoordinate.longitude,
        endCoordinate.latitude,
        endCoordinate.longitude
    );

    const roadAdjustedDistance = geographicDistance > 0 ? geographicDistance * 1.12 : 0;
    return Math.max(statedDistance, roadAdjustedDistance, 25);
}

function getBaseCruiseSpeed(trip, routeStats) {
    const historicalSpeed = parseFloat(routeStats?.avg_speed_kmh) || 0;
    const statedDistance = parseFloat(trip.distance_km) || 0;

    let baseline = 42;
    if (historicalSpeed > 0) {
        baseline = historicalSpeed;
    } else if (statedDistance > 450) {
        baseline = 52;
    } else if (statedDistance > 250) {
        baseline = 47;
    }

    return clamp(baseline * getVariationFactor(trip.trip_id), 28, 68);
}

function toPoint(coordinate) {
    return {
        latitude: Number(parseFloat(coordinate.latitude).toFixed(6)),
        longitude: Number(parseFloat(coordinate.longitude).toFixed(6))
    };
}

function deriveTrackedDistanceKm(currentPoint, startCoordinate, endCoordinate, plannedDistanceKm) {
    const fullGeographicDistance = calculateDistanceKm(
        startCoordinate.latitude,
        startCoordinate.longitude,
        endCoordinate.latitude,
        endCoordinate.longitude
    );

    if (fullGeographicDistance <= 0) {
        return 0;
    }

    const coveredGeographicDistance = calculateDistanceKm(
        startCoordinate.latitude,
        startCoordinate.longitude,
        currentPoint.latitude,
        currentPoint.longitude
    );

    return clamp((coveredGeographicDistance / fullGeographicDistance) * plannedDistanceKm, 0, plannedDistanceKm);
}

async function buildTripSnapshot(trip, { force = false } = {}) {
    const now = new Date();
    const routeStats = await TripModel.getRouteHistoricalStats(trip.source, trip.destination);
    const startCoordinate = getLocationCoordinate(trip.source);
    const endCoordinate = getLocationCoordinate(trip.destination);
    const plannedDistanceKm = getPlannedDistanceKm(trip, startCoordinate, endCoordinate);
    const lastPoint = await GpsModel.getLastLocation(trip.trip_id);

    let trackedDistanceKm = parseFloat(trip.gps_distance_km) || 0;
    let currentPoint = lastPoint;

    const shouldAdvance = trip.status === 'Running' && (
        !lastPoint ||
        force ||
        (now.getTime() - new Date(lastPoint.recorded_at).getTime()) >= 45000
    );

    if (shouldAdvance) {
        const trafficMultiplier = EtaService.getTrafficMultiplier(now);
        let speedKmph = clamp(getBaseCruiseSpeed(trip, routeStats) / trafficMultiplier, 12, 70);
        let ignition = true;

        if (!lastPoint) {
            const startTime = trip.start_time ? new Date(trip.start_time) : now;
            const elapsedHours = clamp((now.getTime() - startTime.getTime()) / (1000 * 60 * 60), 0, 18);
            trackedDistanceKm = Math.min(plannedDistanceKm, elapsedHours * speedKmph);
        } else {
            const lastRecordedAt = new Date(lastPoint.recorded_at);
            const deltaHours = clamp((now.getTime() - lastRecordedAt.getTime()) / (1000 * 60 * 60), 0.01, 0.35);
            const remainingDistanceKm = Math.max(plannedDistanceKm - trackedDistanceKm, 0);

            if (remainingDistanceKm <= 0.5) {
                speedKmph = 0;
                ignition = false;
            } else {
                trackedDistanceKm = Math.min(plannedDistanceKm, trackedDistanceKm + (speedKmph * deltaHours));
            }
        }

        const progress = plannedDistanceKm > 0 ? trackedDistanceKm / plannedDistanceKm : 0;
        const simulatedCoordinate = interpolateCoordinate(startCoordinate, endCoordinate, progress);
        const recordedAt = now.toISOString();

        await GpsModel.logLocation({
            truck_id: trip.truck_id,
            trip_id: trip.trip_id,
            latitude: simulatedCoordinate.latitude,
            longitude: simulatedCoordinate.longitude,
            speed_kmph: speedKmph,
            ignition,
            recorded_at: recordedAt
        });
        await TripModel.setGpsDistance(trip.trip_id, trackedDistanceKm);

        currentPoint = {
            latitude: simulatedCoordinate.latitude,
            longitude: simulatedCoordinate.longitude,
            speed_kmph: speedKmph,
            ignition,
            recorded_at: recordedAt
        };
    }

    if (!currentPoint) {
        const fallbackPoint = trip.status === 'Completed' ? endCoordinate : startCoordinate;
        currentPoint = {
            ...fallbackPoint,
            speed_kmph: 0,
            ignition: trip.status === 'Running',
            recorded_at: trip.end_time || trip.start_time || trip.created_at || now.toISOString()
        };
    }

    if (trackedDistanceKm <= 0) {
        trackedDistanceKm = deriveTrackedDistanceKm(currentPoint, startCoordinate, endCoordinate, plannedDistanceKm);
        if (trip.status === 'Completed') {
            trackedDistanceKm = plannedDistanceKm;
        }
    }

    const currentSpeedKmph = parseFloat(currentPoint.speed_kmph) || 0;
    const remainingDistanceKm = Math.max(plannedDistanceKm - trackedDistanceKm, 0);
    const eta = EtaService.calculateEta({
        remainingDistanceKm,
        currentSpeedKmph,
        historicalAvgSpeedKmph: routeStats?.avg_speed_kmh,
        currentTime: now
    });

    return {
        trip_id: trip.trip_id,
        truck_id: trip.truck_id,
        truck_number: trip.truck_number,
        driver_id: trip.driver_id,
        driver_name: trip.driver_name,
        source: trip.source,
        destination: trip.destination,
        status: trip.status,
        start_coord: toPoint(startCoordinate),
        current_coord: toPoint(currentPoint),
        end_coord: toPoint(endCoordinate),
        progress_percent: Number(clamp((trackedDistanceKm / plannedDistanceKm) * 100, 0, 100).toFixed(1)),
        tracked_distance_km: Number(trackedDistanceKm.toFixed(1)),
        planned_distance_km: Number(plannedDistanceKm.toFixed(1)),
        remaining_distance_km: Number(remainingDistanceKm.toFixed(1)),
        speed_kmph: Number(currentSpeedKmph.toFixed(1)),
        ignition: Boolean(currentPoint.ignition),
        eta_minutes: eta.eta_minutes,
        eta_text: eta.eta_text,
        estimated_arrival: eta.estimated_arrival,
        delay_risk: eta.delay_risk,
        traffic_multiplier: eta.traffic_multiplier,
        confidence: eta.confidence,
        historical_avg_speed_kmph: Number((parseFloat(routeStats?.avg_speed_kmh) || 0).toFixed(1)),
        last_reported_at: currentPoint.recorded_at
    };
}

const MockGpsService = {
    async syncRunningTrips({ tripId = null, force = false } = {}) {
        let runningTrips = [];

        if (tripId) {
            const trip = await TripModel.getById(tripId);
            if (trip && trip.status === 'Running') {
                runningTrips = [trip];
            }
        } else {
            runningTrips = await TripModel.getAll({ status: 'Running' });
        }

        return Promise.all(runningTrips.map((trip) => buildTripSnapshot(trip, { force })));
    },

    async getTripLiveView(trip, { force = false } = {}) {
        const snapshot = await buildTripSnapshot(trip, { force });
        const routePoints = await GpsModel.getRoutePoints(trip.trip_id);

        return {
            ...snapshot,
            route_points: routePoints.map((point) => ({
                latitude: Number(parseFloat(point.latitude).toFixed(6)),
                longitude: Number(parseFloat(point.longitude).toFixed(6)),
                speed_kmph: Number(parseFloat(point.speed_kmph || 0).toFixed(1)),
                ignition: Boolean(point.ignition),
                recorded_at: point.recorded_at
            }))
        };
    },

    getLocationCoordinate,
    calculateDistanceKm
};

module.exports = MockGpsService;