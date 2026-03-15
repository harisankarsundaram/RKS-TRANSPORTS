const TICK_INTERVAL_MS = 5000;
const AUTO_RESTART_DELAY_MS = 15000;

function isoNow(date = new Date()) {
    return date.toISOString();
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function haversineDistanceKm(start, end) {
    const toRadians = (degrees) => degrees * (Math.PI / 180);

    const earthRadiusKm = 6371;
    const dLat = toRadians(end.latitude - start.latitude);
    const dLon = toRadians(end.longitude - start.longitude);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(start.latitude)) * Math.cos(toRadians(end.latitude)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
}

function calculateRouteDistanceKm(route) {
    if (!Array.isArray(route) || route.length < 2) {
        return 0;
    }

    let total = 0;
    for (let index = 1; index < route.length; index += 1) {
        total += haversineDistanceKm(route[index - 1], route[index]);
    }
    return total;
}

const ROUTE_COIMBATORE_TO_CHENNAI = [
    { latitude: 11.0168, longitude: 76.9558 },
    { latitude: 11.3428, longitude: 77.7282 },
    { latitude: 11.6643, longitude: 78.1460 },
    { latitude: 12.0379, longitude: 78.4845 },
    { latitude: 12.5266, longitude: 78.2137 },
    { latitude: 12.9249, longitude: 79.1346 },
    { latitude: 13.0827, longitude: 80.2707 }
];

const ROUTE_BANGALORE_TO_HYDERABAD = [
    { latitude: 12.9716, longitude: 77.5946 },
    { latitude: 13.1986, longitude: 77.7066 },
    { latitude: 14.3188, longitude: 77.0560 },
    { latitude: 15.9129, longitude: 78.1038 },
    { latitude: 16.5720, longitude: 79.1600 },
    { latitude: 17.3850, longitude: 78.4867 }
];

const VEHICLE_BLUEPRINTS = [
    {
        vehicleId: 'TRUCK_101',
        mileageKmpl: 5,
        source: 'Coimbatore',
        destination: 'Chennai',
        route: ROUTE_COIMBATORE_TO_CHENNAI
    },
    {
        vehicleId: 'TRUCK_102',
        mileageKmpl: 4.6,
        source: 'Bangalore',
        destination: 'Hyderabad',
        route: ROUTE_BANGALORE_TO_HYDERABAD
    }
];

class MockTrackingProvider {
    constructor() {
        this.tickHandle = null;
        this.tripSequence = 1;
        this.vehicles = new Map();
        this.trips = new Map();

        this.initializeVehicles();
        this.bootstrapTracking();
        this.startSimulation();
    }

    initializeVehicles() {
        for (const blueprint of VEHICLE_BLUEPRINTS) {
            this.vehicles.set(blueprint.vehicleId, {
                vehicleId: blueprint.vehicleId,
                mileageKmpl: blueprint.mileageKmpl,
                source: blueprint.source,
                destination: blueprint.destination,
                route: blueprint.route,
                routeDistanceKm: calculateRouteDistanceKm(blueprint.route),
                routeIndex: 0,
                speedKmph: 0,
                ignition: false,
                status: 'not_started',
                currentTripId: null,
                lastLocationAt: isoNow(),
                completedAtMs: 0
            });
        }
    }

    bootstrapTracking() {
        const startedTrips = [];

        for (const vehicle of this.vehicles.values()) {
            if (!vehicle.currentTripId) {
                startedTrips.push(this.startTrip(vehicle.vehicleId));
                continue;
            }

            const trip = this.trips.get(vehicle.currentTripId);
            if (!trip || trip.status !== 'in_progress') {
                startedTrips.push(this.startTrip(vehicle.vehicleId));
            }
        }

        return startedTrips;
    }

    startSimulation() {
        if (this.tickHandle) {
            return;
        }

        this.tickHandle = setInterval(() => {
            this.tickVehicles();
        }, TICK_INTERVAL_MS);

        if (typeof this.tickHandle.unref === 'function') {
            this.tickHandle.unref();
        }
    }

    getVehicleOrThrow(vehicleId) {
        const vehicle = this.vehicles.get(vehicleId);
        if (!vehicle) {
            const error = new Error(`Vehicle ${vehicleId} not found`);
            error.status = 404;
            throw error;
        }
        return vehicle;
    }

    getTripOrThrow(tripId) {
        const trip = this.trips.get(tripId);
        if (!trip) {
            const error = new Error(`Trip ${tripId} not found`);
            error.status = 404;
            throw error;
        }
        return trip;
    }

    getCurrentPoint(vehicle) {
        return vehicle.route[vehicle.routeIndex] || vehicle.route[0];
    }

    getProgressPercentage(vehicle) {
        if (vehicle.route.length <= 1) {
            return 100;
        }

        const raw = (vehicle.routeIndex / (vehicle.route.length - 1)) * 100;
        return Number(raw.toFixed(2));
    }

    appendHistoryPoint(vehicle, trip, timestamp) {
        const point = this.getCurrentPoint(vehicle);
        trip.history.push({
            vehicleId: vehicle.vehicleId,
            latitude: Number(point.latitude.toFixed(6)),
            longitude: Number(point.longitude.toFixed(6)),
            speed: Number(vehicle.speedKmph.toFixed(1)),
            timestamp,
            ignition: vehicle.ignition,
            routeIndex: vehicle.routeIndex
        });
    }

    ensureVehicleAdvancedIfDue(vehicle, nowMs = Date.now()) {
        if (!vehicle.currentTripId) {
            return;
        }

        const trip = this.trips.get(vehicle.currentTripId);
        if (!trip || trip.status !== 'in_progress') {
            return;
        }

        const elapsedMs = nowMs - trip.lastTickAtMs;
        if (elapsedMs < TICK_INTERVAL_MS) {
            return;
        }

        const steps = Math.floor(elapsedMs / TICK_INTERVAL_MS);
        for (let step = 0; step < steps; step += 1) {
            const tickAt = new Date(trip.lastTickAtMs + (step + 1) * TICK_INTERVAL_MS);
            this.advanceOnePoint(vehicle, trip, tickAt);
            if (trip.status !== 'in_progress') {
                break;
            }
        }

        trip.lastTickAtMs += steps * TICK_INTERVAL_MS;
    }

    advanceOnePoint(vehicle, trip, tickDate) {
        if (trip.status !== 'in_progress') {
            return;
        }

        const timestamp = isoNow(tickDate);
        const isAtLastPoint = vehicle.routeIndex >= vehicle.route.length - 1;

        if (isAtLastPoint) {
            this.completeTrip(vehicle, trip, timestamp, true);
            return;
        }

        const previousPoint = vehicle.route[vehicle.routeIndex];
        const nextIndex = Math.min(vehicle.routeIndex + 1, vehicle.route.length - 1);
        const nextPoint = vehicle.route[nextIndex];
        const segmentDistance = haversineDistanceKm(previousPoint, nextPoint);

        vehicle.routeIndex = nextIndex;
        vehicle.speedKmph = randomBetween(36, 58);
        vehicle.ignition = true;
        vehicle.lastLocationAt = timestamp;

        trip.distanceTravelledKm += segmentDistance;
        trip.distanceRemainingKm = Math.max(vehicle.routeDistanceKm - trip.distanceTravelledKm, 0);
        trip.progressPercentage = this.getProgressPercentage(vehicle);

        this.appendHistoryPoint(vehicle, trip, timestamp);

        if (vehicle.routeIndex >= vehicle.route.length - 1) {
            this.completeTrip(vehicle, trip, timestamp, true);
        }
    }

    completeTrip(vehicle, trip, timestamp, reachedRouteEnd) {
        trip.status = 'completed';
        trip.endedAt = timestamp;
        vehicle.status = 'completed';
        vehicle.ignition = false;
        vehicle.speedKmph = 0;
        vehicle.lastLocationAt = timestamp;
        vehicle.completedAtMs = Date.parse(timestamp) || Date.now();

        if (reachedRouteEnd) {
            trip.distanceTravelledKm = vehicle.routeDistanceKm;
            trip.distanceRemainingKm = 0;
            trip.progressPercentage = 100;
        } else {
            trip.progressPercentage = this.getProgressPercentage(vehicle);
            trip.distanceRemainingKm = Math.max(vehicle.routeDistanceKm - trip.distanceTravelledKm, 0);
        }
    }

    tickVehicles() {
        const nowMs = Date.now();
        for (const vehicle of this.vehicles.values()) {
            const activeTrip = vehicle.currentTripId
                ? this.trips.get(vehicle.currentTripId)
                : null;

            if (activeTrip && activeTrip.status === 'in_progress') {
                this.ensureVehicleAdvancedIfDue(vehicle, nowMs);
                continue;
            }

            if (!activeTrip || activeTrip.status !== 'in_progress') {
                const elapsedSinceCompletion = nowMs - (vehicle.completedAtMs || 0);
                if (elapsedSinceCompletion >= AUTO_RESTART_DELAY_MS) {
                    try {
                        this.startTrip(vehicle.vehicleId);
                    } catch {
                        // Ignore auto-restart errors and continue simulation.
                    }
                }
            }
        }
    }

    getVehicles() {
        this.tickVehicles();

        return Array.from(this.vehicles.values()).map((vehicle) => {
            const point = this.getCurrentPoint(vehicle);
            return {
                vehicleId: vehicle.vehicleId,
                status: vehicle.status,
                tripId: vehicle.currentTripId,
                mileage: vehicle.mileageKmpl,
                latitude: Number(point.latitude.toFixed(6)),
                longitude: Number(point.longitude.toFixed(6)),
                speed: Number(vehicle.speedKmph.toFixed(1)),
                ignition: vehicle.ignition,
                timestamp: vehicle.lastLocationAt
            };
        });
    }

    getVehicleLocation(vehicleId) {
        this.tickVehicles();
        const vehicle = this.getVehicleOrThrow(vehicleId);

        if (vehicle.currentTripId) {
            const trip = this.trips.get(vehicle.currentTripId);
            if (trip && trip.status === 'in_progress') {
                const now = new Date();
                this.advanceOnePoint(vehicle, trip, now);
                trip.lastTickAtMs = now.getTime();
            }
        }

        const point = this.getCurrentPoint(vehicle);

        return {
            vehicleId: vehicle.vehicleId,
            latitude: Number(point.latitude.toFixed(6)),
            longitude: Number(point.longitude.toFixed(6)),
            speed: Number(vehicle.speedKmph.toFixed(1)),
            timestamp: vehicle.lastLocationAt,
            ignition: vehicle.ignition,
            status: vehicle.status,
            tripId: vehicle.currentTripId
        };
    }

    getVehicleRoute(vehicleId) {
        const vehicle = this.getVehicleOrThrow(vehicleId);
        return vehicle.route.map((point, index) => ({
            index,
            latitude: Number(point.latitude.toFixed(6)),
            longitude: Number(point.longitude.toFixed(6))
        }));
    }

    startTrip(vehicleId) {
        const vehicle = this.getVehicleOrThrow(vehicleId);

        if (vehicle.currentTripId) {
            const activeTrip = this.trips.get(vehicle.currentTripId);
            if (activeTrip && activeTrip.status === 'in_progress') {
                const error = new Error(`Trip ${activeTrip.tripId} already in progress for vehicle ${vehicleId}`);
                error.status = 409;
                throw error;
            }
        }

        const now = new Date();
        const tripId = `TRIP_${String(this.tripSequence).padStart(4, '0')}`;
        this.tripSequence += 1;

        vehicle.routeIndex = 0;
        vehicle.speedKmph = randomBetween(34, 52);
        vehicle.ignition = true;
        vehicle.status = 'in_progress';
        vehicle.currentTripId = tripId;
        vehicle.lastLocationAt = isoNow(now);
        vehicle.completedAtMs = 0;

        const trip = {
            tripId,
            vehicleId,
            status: 'in_progress',
            startedAt: isoNow(now),
            endedAt: null,
            progressPercentage: 0,
            totalRouteDistanceKm: Number(vehicle.routeDistanceKm.toFixed(3)),
            distanceTravelledKm: 0,
            distanceRemainingKm: Number(vehicle.routeDistanceKm.toFixed(3)),
            history: [],
            lastTickAtMs: now.getTime()
        };

        this.appendHistoryPoint(vehicle, trip, isoNow(now));
        this.trips.set(tripId, trip);

        return {
            tripId,
            vehicleId,
            status: trip.status,
            startedAt: trip.startedAt
        };
    }

    endTrip(tripId) {
        this.tickVehicles();
        const trip = this.getTripOrThrow(tripId);
        const vehicle = this.getVehicleOrThrow(trip.vehicleId);

        if (trip.status === 'completed') {
            return {
                tripId: trip.tripId,
                vehicleId: trip.vehicleId,
                status: trip.status,
                endedAt: trip.endedAt
            };
        }

        const timestamp = isoNow(new Date());
        this.completeTrip(vehicle, trip, timestamp, false);

        return {
            tripId: trip.tripId,
            vehicleId: trip.vehicleId,
            status: trip.status,
            endedAt: trip.endedAt
        };
    }

    getTripProgress(tripId) {
        this.tickVehicles();
        const trip = this.getTripOrThrow(tripId);

        return {
            tripId: trip.tripId,
            vehicleId: trip.vehicleId,
            status: trip.status,
            progressPercentage: Number(trip.progressPercentage.toFixed(2)),
            routePointsCompleted: Math.max(trip.history.length - 1, 0),
            routeTotalPoints: this.getVehicleOrThrow(trip.vehicleId).route.length,
            distanceTravelledKm: Number(trip.distanceTravelledKm.toFixed(3)),
            distanceRemainingKm: Number(trip.distanceRemainingKm.toFixed(3))
        };
    }

    getTripEta(tripId) {
        this.tickVehicles();
        const trip = this.getTripOrThrow(tripId);
        const vehicle = this.getVehicleOrThrow(trip.vehicleId);

        let currentSpeed = Number(vehicle.speedKmph.toFixed(1));

        if (trip.status !== 'in_progress') {
            currentSpeed = 0;
        }

        if (trip.status === 'in_progress' && currentSpeed <= 0) {
            const knownSpeeds = trip.history.map((point) => point.speed).filter((speed) => speed > 0);
            if (knownSpeeds.length > 0) {
                const avg = knownSpeeds.reduce((sum, speed) => sum + speed, 0) / knownSpeeds.length;
                currentSpeed = Number(avg.toFixed(1));
            } else {
                currentSpeed = 40;
            }
        }

        const etaMinutes = trip.status === 'completed' || trip.distanceRemainingKm <= 0
            ? 0
            : Number(((trip.distanceRemainingKm / currentSpeed) * 60).toFixed(2));

        return {
            tripId: trip.tripId,
            vehicleId: trip.vehicleId,
            status: trip.status,
            currentSpeed,
            distanceRemainingKm: Number(trip.distanceRemainingKm.toFixed(3)),
            etaMinutes
        };
    }

    getTripFuel(tripId) {
        this.tickVehicles();
        const trip = this.getTripOrThrow(tripId);
        const vehicle = this.getVehicleOrThrow(trip.vehicleId);

        const fuelUsedLiters = trip.distanceTravelledKm / vehicle.mileageKmpl;

        return {
            tripId: trip.tripId,
            vehicleId: trip.vehicleId,
            mileage: vehicle.mileageKmpl,
            distanceTravelledKm: Number(trip.distanceTravelledKm.toFixed(3)),
            fuelUsedLiters: Number(fuelUsedLiters.toFixed(3))
        };
    }

    getTripHistory(tripId) {
        this.tickVehicles();
        const trip = this.getTripOrThrow(tripId);

        return {
            tripId: trip.tripId,
            vehicleId: trip.vehicleId,
            status: trip.status,
            startedAt: trip.startedAt,
            endedAt: trip.endedAt,
            history: trip.history
        };
    }

    estimateDelayRiskPercentage(trip, etaMinutes) {
        if (trip.status !== 'in_progress') {
            return 0;
        }

        if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) {
            return 0;
        }

        const progressPenalty = Math.max(0, 1 - (trip.progressPercentage / 100));
        const normalizedEta = Math.min(etaMinutes / 360, 1);
        const risk = ((normalizedEta * 70) + (progressPenalty * 30));
        return Number(Math.min(Math.max(risk, 0), 100).toFixed(2));
    }

    getTrackingLive() {
        this.tickVehicles();

        return Array.from(this.vehicles.values())
            .map((vehicle) => {
                const trip = vehicle.currentTripId
                    ? this.trips.get(vehicle.currentTripId)
                    : null;

                if (!trip || trip.status !== 'in_progress') {
                    return null;
                }

                const point = this.getCurrentPoint(vehicle);
                return {
                    truck_id: vehicle.vehicleId,
                    truck_number: vehicle.vehicleId,
                    trip_id: trip.tripId,
                    latitude: Number(point.latitude.toFixed(6)),
                    longitude: Number(point.longitude.toFixed(6)),
                    speed: Number(vehicle.speedKmph.toFixed(1)),
                    timestamp: vehicle.lastLocationAt,
                    trip_progress: Number((trip.progressPercentage / 100).toFixed(4)),
                    distance_travelled: Number(trip.distanceTravelledKm.toFixed(3)),
                    trip_distance: Number(trip.totalRouteDistanceKm.toFixed(3))
                };
            })
            .filter(Boolean);
    }

    getTrackingTrip(tripId) {
        this.tickVehicles();

        const trip = this.getTripOrThrow(tripId);
        const vehicle = this.getVehicleOrThrow(trip.vehicleId);
        const eta = this.getTripEta(tripId);
        const delayRiskPercentage = this.estimateDelayRiskPercentage(trip, eta.etaMinutes);

        const route = vehicle.route.map((point) => ({
            latitude: Number(point.latitude.toFixed(6)),
            longitude: Number(point.longitude.toFixed(6))
        }));

        const gpsLogs = trip.history.map((point) => ({
            latitude: Number(point.latitude),
            longitude: Number(point.longitude),
            speed: Number(point.speed),
            timestamp: point.timestamp
        }));

        return {
            trip_id: trip.tripId,
            truck_id: trip.vehicleId,
            source: vehicle.source,
            destination: vehicle.destination,
            status: trip.status,
            gps_logs: gpsLogs,
            route,
            distance_travelled_km: Number(trip.distanceTravelledKm.toFixed(3)),
            total_route_distance_km: Number(trip.totalRouteDistanceKm.toFixed(3)),
            progress: Number((trip.progressPercentage / 100).toFixed(4)),
            progress_percent: Number(trip.progressPercentage.toFixed(2)),
            eta_minutes: Number(eta.etaMinutes.toFixed(2)),
            delay_risk_percentage: delayRiskPercentage
        };
    }
}

const mockTrackingProvider = new MockTrackingProvider();

module.exports = {
    mockTrackingProvider,
    haversineDistanceKm,
    TICK_INTERVAL_MS
};
