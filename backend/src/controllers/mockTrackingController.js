const pool = require('../config/db');
const { mockTrackingProvider, haversineDistanceKm } = require('../services/mockTrackingProvider');

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
    const routePolyline = parseRoutePolyline(trip.route_polyline);

    const route = routePolyline.length > 0
        ? routePolyline
        : logs.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));

    const routeDistanceFromPolyline = sumDistanceKm(route);
    const routeDistanceFromRecord = toNumber(trip.route_distance, 0) || toNumber(trip.distance_km, 0);
    const totalRouteDistanceKm = routeDistanceFromPolyline > 0 ? routeDistanceFromPolyline : routeDistanceFromRecord;

    const distanceFromLogs = sumDistanceKm(logs);
    const distanceFromTripGps = toNumber(trip.gps_distance_km, 0);
    const distanceTravelledKm = distanceFromLogs > 0 ? distanceFromLogs : distanceFromTripGps;

    const normalizedTotalRouteDistanceKm = Math.max(totalRouteDistanceKm, distanceTravelledKm);
    const progress = normalizedTotalRouteDistanceKm > 0
        ? Math.min(distanceTravelledKm / normalizedTotalRouteDistanceKm, 1)
        : 0;

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
    const distanceRemainingKm = Math.max(normalizedTotalRouteDistanceKm - distanceTravelledKm, 0);
    const progressPercent = progress * 100;
    const etaMinutes = isActiveStatus(trip.status)
        ? estimateEtaMinutes(distanceRemainingKm, currentSpeedKmph)
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
