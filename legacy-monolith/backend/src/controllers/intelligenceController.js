const pool = require('../config/db');

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

function sumDistance(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return 0;
    }

    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += distanceKm(points[index - 1], points[index]);
    }
    return total;
}

async function createAlertIfNotRecent({ truckId, tripId, alertType, description, withinMinutes = 180 }) {
    const duplicate = await pool.query(
        `SELECT id
         FROM alerts
         WHERE truck_id = $1
           AND COALESCE(trip_id, -1) = COALESCE($2, -1)
           AND alert_type = $3
           AND created_at >= NOW() - ($4::text || ' minutes')::interval
         LIMIT 1`,
        [truckId, tripId || null, alertType, withinMinutes]
    );

    if (duplicate.rows.length > 0) {
        return null;
    }

    const inserted = await pool.query(
        `INSERT INTO alerts (truck_id, trip_id, alert_type, description, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING *`,
        [truckId, tripId || null, alertType, description]
    );

    return inserted.rows[0] || null;
}

async function getTripLogs(tripId) {
    const result = await pool.query(
        `SELECT latitude, longitude, COALESCE(speed_kmph, 0) AS speed, recorded_at
         FROM gps_logs
         WHERE trip_id = $1
         ORDER BY recorded_at ASC`,
        [tripId]
    );

    return result.rows.map((row) => ({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speed: Number(row.speed || 0),
        recorded_at: row.recorded_at
    }));
}

const MODEL_CATALOG = [
    {
        domain: 'ETA prediction',
        model_name: 'linear_regression',
        service: 'ml-service',
        endpoint: '/predict/eta',
        description: 'Fast baseline ETA estimator trained on distance, current speed, and historical speed.'
    },
    {
        domain: 'ETA prediction',
        model_name: 'random_forest_regressor',
        service: 'ml-service',
        endpoint: '/predict/eta',
        description: 'Non-linear ETA estimator used alongside linear regression for blended ETA output.'
    },
    {
        domain: 'Delay risk',
        model_name: 'logistic_regression',
        service: 'ml-service',
        endpoint: '/predict/delay',
        description: 'Probability model for delay classification using slack time, ETA, distance, and traffic level.'
    },
    {
        domain: 'Delay risk',
        model_name: 'random_forest_classifier',
        service: 'ml-service',
        endpoint: '/predict/delay',
        description: 'Tree-based delay classifier combined with logistic regression probability for final risk score.'
    },
    {
        domain: 'Fallback',
        model_name: 'heuristic_eta_delay',
        service: 'frontend-backend fallback',
        endpoint: 'n/a',
        description: 'Distance/speed and progress-based deterministic fallback when ML endpoint is unavailable.'
    }
];

const IntelligenceController = {
    async listBookings(req, res, next) {
        try {
            const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
            const params = [];
            const where = [];

            if (status) {
                params.push(status);
                where.push(`status = $${params.length}`);
            }

            const result = await pool.query(
                `SELECT *
                 FROM booking_requests
                 ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY created_at DESC`,
                params
            );

            return res.json({ success: true, count: result.rows.length, data: result.rows });
        } catch (error) {
            return next(error);
        }
    },

    async getFuelAnomalies(req, res, next) {
        try {
            const { trip_id: tripIdQuery } = req.query;
            const params = [];
            const where = ["LOWER(t.status) IN ('running', 'in_progress', 'completed')"];

            if (tripIdQuery) {
                params.push(Number(tripIdQuery));
                where.push(`t.trip_id = $${params.length}`);
            }

            const result = await pool.query(
                `SELECT
                    t.trip_id,
                    t.truck_id,
                    COALESCE(NULLIF(t.gps_distance_km, 0), t.distance_km, 0) AS distance_km,
                    COALESCE(tr.mileage_kmpl, 4.5) AS truck_mileage,
                    COALESCE(SUM(COALESCE(f.fuel_filled, f.liters, 0)), 0) AS actual_fuel
                 FROM trips t
                 JOIN trucks tr ON tr.truck_id = t.truck_id
                 LEFT JOIN fuel_logs f ON f.trip_id = t.trip_id
                 WHERE ${where.join(' AND ')}
                 GROUP BY t.trip_id, t.truck_id, t.gps_distance_km, t.distance_km, tr.mileage_kmpl
                 ORDER BY t.trip_id DESC`,
                params
            );

            const anomalies = [];
            const createdAlerts = [];

            for (const row of result.rows) {
                const distance = Number(row.distance_km || 0);
                const mileage = Math.max(Number(row.truck_mileage || 4.5), 0.1);
                const actualFuel = Number(row.actual_fuel || 0);
                const expectedFuel = distance / mileage;
                const threshold = expectedFuel * 1.2;
                const isAnomaly = expectedFuel > 0 && actualFuel > threshold;

                if (!isAnomaly) {
                    continue;
                }

                const item = {
                    trip_id: row.trip_id,
                    truck_id: row.truck_id,
                    distance_km: Number(distance.toFixed(2)),
                    truck_mileage: Number(mileage.toFixed(2)),
                    expected_fuel: Number(expectedFuel.toFixed(2)),
                    actual_fuel: Number(actualFuel.toFixed(2)),
                    threshold: Number(threshold.toFixed(2)),
                    is_anomaly: true
                };

                anomalies.push(item);

                const alert = await createAlertIfNotRecent({
                    truckId: row.truck_id,
                    tripId: row.trip_id,
                    alertType: 'fuel_anomaly',
                    description: `Fuel anomaly: expected ${item.expected_fuel}L, actual ${item.actual_fuel}L`,
                    withinMinutes: 240
                });

                if (alert) {
                    createdAlerts.push(alert);
                }
            }

            return res.json({
                success: true,
                count: anomalies.length,
                data: anomalies,
                alerts_created: createdAlerts.length,
                alerts: createdAlerts
            });
        } catch (error) {
            return next(error);
        }
    },

    async getBackhaulSuggestions(req, res, next) {
        try {
            const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));

            const [bookingsResult, latestTruckPointsResult, completedTripsResult] = await Promise.all([
                pool.query(
                    `SELECT id, pickup_location, destination, load_type, weight, offered_price,
                            pickup_latitude, pickup_longitude, pickup_date
                     FROM booking_requests
                     WHERE status = 'pending'
                     ORDER BY pickup_date ASC, created_at ASC`
                ),
                pool.query(
                    `SELECT DISTINCT ON (truck_id)
                        truck_id,
                        latitude,
                        longitude,
                        trip_id,
                        recorded_at
                     FROM gps_logs
                     ORDER BY truck_id, recorded_at DESC`
                ),
                pool.query(
                    `SELECT DISTINCT ON (truck_id)
                        trip_id,
                        truck_id,
                        destination,
                        end_time
                     FROM trips
                     WHERE status = 'Completed'
                     ORDER BY truck_id, end_time DESC NULLS LAST`
                )
            ]);

            const lastCompletedTripByTruck = new Map(
                completedTripsResult.rows.map((trip) => [Number(trip.truck_id), trip])
            );

            const suggestions = [];

            for (const truckPoint of latestTruckPointsResult.rows) {
                const truckPosition = {
                    latitude: Number(truckPoint.latitude),
                    longitude: Number(truckPoint.longitude)
                };

                if (!Number.isFinite(truckPosition.latitude) || !Number.isFinite(truckPosition.longitude)) {
                    continue;
                }

                for (const booking of bookingsResult.rows) {
                    if (booking.pickup_latitude === null || booking.pickup_longitude === null) {
                        continue;
                    }

                    const distanceToPickup = distanceKm(
                        truckPosition,
                        {
                            latitude: Number(booking.pickup_latitude),
                            longitude: Number(booking.pickup_longitude)
                        }
                    );

                    if (distanceToPickup > 75) {
                        continue;
                    }

                    const lastCompleted = lastCompletedTripByTruck.get(Number(truckPoint.truck_id));

                    suggestions.push({
                        message: 'Backhaul opportunity detected',
                        trip_id: lastCompleted?.trip_id || truckPoint.trip_id || null,
                        truck_id: Number(truckPoint.truck_id),
                        booking_id: Number(booking.id),
                        distance_to_pickup_km: Number(distanceToPickup.toFixed(2)),
                        pickup_location: booking.pickup_location,
                        destination: booking.destination,
                        offered_price: Number(booking.offered_price || 0),
                        load_type: booking.load_type,
                        weight: Number(booking.weight || 0)
                    });
                }
            }

            suggestions.sort((a, b) => a.distance_to_pickup_km - b.distance_to_pickup_km);
            const trimmed = suggestions.slice(0, limit);

            return res.json({ success: true, count: trimmed.length, data: trimmed });
        } catch (error) {
            return next(error);
        }
    },

    async listAlerts(req, res, next) {
        try {
            const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 300));
            const includeAll = String(req.query.include_all || '').toLowerCase() === 'true';

            if (includeAll) {
                const result = await pool.query(
                    `SELECT *
                     FROM alerts
                     ORDER BY created_at DESC
                     LIMIT $1`,
                    [limit]
                );

                return res.json({ success: true, count: result.rows.length, data: result.rows });
            }

            const allowedTypes = ['overspeed', 'idle_vehicle', 'no_progress_24h'];
            const result = await pool.query(
                `SELECT *
                 FROM alerts
                 WHERE alert_type = ANY($1::text[])
                 ORDER BY created_at DESC
                 LIMIT $2`,
                [allowedTypes, limit]
            );

            return res.json({ success: true, count: result.rows.length, data: result.rows });
        } catch (error) {
            return next(error);
        }
    },

    async evaluateAlerts(req, res, next) {
        try {
            const runningTrips = await pool.query(
                `SELECT
                    t.trip_id,
                    t.truck_id,
                    COALESCE(t.start_time, t.created_at) AS started_at
                 FROM trips t
                 WHERE LOWER(t.status) IN ('running', 'in_progress')`
            );

            const createdAlerts = [];

            for (const trip of runningTrips.rows) {
                const logs = await getTripLogs(trip.trip_id);
                if (logs.length === 0) {
                    continue;
                }

                const latest = logs[logs.length - 1];

                if (Number(latest.speed || 0) > 80) {
                    const alert = await createAlertIfNotRecent({
                        truckId: trip.truck_id,
                        tripId: trip.trip_id,
                        alertType: 'overspeed',
                        description: `Overspeed detected at ${Number(latest.speed).toFixed(1)} km/h`,
                        withinMinutes: 45
                    });
                    if (alert) {
                        createdAlerts.push(alert);
                    }
                }

                const idleWindow = logs.filter((row) => {
                    const ageMs = Date.now() - new Date(row.recorded_at).getTime();
                    return ageMs <= (30 * 60 * 1000);
                });

                if (idleWindow.length > 1) {
                    const allZero = idleWindow.every((row) => Number(row.speed || 0) === 0);
                    const idleMinutes = (new Date(idleWindow[idleWindow.length - 1].recorded_at) - new Date(idleWindow[0].recorded_at)) / (1000 * 60);

                    if (allZero && idleMinutes >= 30) {
                        const alert = await createAlertIfNotRecent({
                            truckId: trip.truck_id,
                            tripId: trip.trip_id,
                            alertType: 'idle_vehicle',
                            description: `Vehicle idle for ${idleMinutes.toFixed(1)} minutes`,
                            withinMinutes: 60
                        });
                        if (alert) {
                            createdAlerts.push(alert);
                        }
                    }
                }

                const startedAtMs = trip.started_at ? new Date(trip.started_at).getTime() : NaN;
                const tripAgeMs = Number.isFinite(startedAtMs) ? (Date.now() - startedAtMs) : (24 * 60 * 60 * 1000);

                if (tripAgeMs >= (24 * 60 * 60 * 1000)) {
                    const last24hLogs = logs.filter((row) => {
                        const ageMs = Date.now() - new Date(row.recorded_at).getTime();
                        return ageMs <= (24 * 60 * 60 * 1000);
                    });

                    let noProgress24h = false;
                    let progressKm24h = 0;

                    if (last24hLogs.length < 2) {
                        noProgress24h = true;
                    } else {
                        progressKm24h = sumDistance(last24hLogs);
                        noProgress24h = progressKm24h < 0.5;
                    }

                    if (noProgress24h) {
                        const alert = await createAlertIfNotRecent({
                            truckId: trip.truck_id,
                            tripId: trip.trip_id,
                            alertType: 'no_progress_24h',
                            description: progressKm24h > 0
                                ? `No meaningful progress in last 24 hours (${progressKm24h.toFixed(2)} km)`
                                : 'No trip progress recorded in last 24 hours',
                            withinMinutes: 1440
                        });
                        if (alert) {
                            createdAlerts.push(alert);
                        }
                    }
                }
            }

            return res.json({ success: true, alerts_created: createdAlerts.length, data: createdAlerts });
        } catch (error) {
            return next(error);
        }
    },

    getMlModelCatalog(req, res) {
        return res.json({
            success: true,
            count: MODEL_CATALOG.length,
            data: MODEL_CATALOG
        });
    }
};

module.exports = IntelligenceController;
