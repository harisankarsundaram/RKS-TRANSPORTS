const GpsModel = require('../models/gpsModel');
const TripModel = require('../models/tripModel');
const DriverModel = require('../models/driverModel');
const EtaService = require('../services/etaService');
const MockGpsService = require('../services/mockGpsService');

// Haversine Formula for distance in KM
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function parseIgnitionValue(value) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        return !['false', '0', 'off', 'no'].includes(value.trim().toLowerCase());
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    return true;
}

const GpsController = {
    // POST /api/gps
    async logGpsData(req, res, next) {
        try {
            const {
                truck_id,
                trip_id,
                latitude,
                longitude,
                speed_kmph,
                ignition,
                recorded_at
            } = req.body;

            if (!truck_id || !trip_id || !latitude || !longitude) {
                return res.status(400).json({ success: false, message: 'Missing GPS data fields' });
            }

            // 1. Validate Trip Status
            const trip = await TripModel.getById(trip_id);
            if (!trip) {
                return res.status(404).json({ success: false, message: 'Trip not found' });
            }
            if (trip.status !== 'Running') {
                return res.status(400).json({ success: false, message: 'GPS data accepted only for Running trips' });
            }

            // 2. Calculate Distance from Last Point
            const lastPoint = await GpsModel.getLastLocation(trip_id);
            let distanceSegment = 0;

            if (lastPoint) {
                const rawDist = calculateDistance(
                    parseFloat(lastPoint.latitude), parseFloat(lastPoint.longitude),
                    parseFloat(latitude), parseFloat(longitude)
                );

                // CORRECTNESS FIX: GPS Jitter Filter
                // If distance is less than 50 meters (0.05 km), ignore it as noise/parking drift
                if (rawDist > 0.05) {
                    distanceSegment = rawDist;
                }
            }

            // 3. Log Data
            await GpsModel.logLocation({
                truck_id,
                trip_id,
                latitude,
                longitude,
                speed_kmph: speed_kmph !== undefined ? parseFloat(speed_kmph) : 0,
                ignition: ignition !== undefined ? parseIgnitionValue(ignition) : true,
                recorded_at
            });

            // 4. Update Trip Distance (only if moved > 50m)
            if (distanceSegment > 0) {
                await TripModel.updateDistance(trip_id, distanceSegment);
            }

            const refreshedTrip = await TripModel.getById(trip_id);
            const liveView = await MockGpsService.getTripLiveView(refreshedTrip, { force: false });

            res.json({
                success: true,
                message: 'GPS logged',
                data: {
                    added_distance_km: Number(distanceSegment.toFixed(3)),
                    live_view: liveView
                }
            });

        } catch (error) {
            next(error);
        }
    },

    async getLiveFleetSnapshot(req, res, next) {
        try {
            const fleet = await MockGpsService.syncRunningTrips({
                force: req.query.force === 'true'
            });

            const etaValues = fleet
                .map(item => item.eta_minutes)
                .filter(value => Number.isFinite(value) && value >= 0);

            const averageEtaMinutes = etaValues.length
                ? etaValues.reduce((sum, value) => sum + value, 0) / etaValues.length
                : null;

            const delayedCount = fleet.filter(item => item.delay_risk === 'high').length;

            res.json({
                success: true,
                data: {
                    refreshed_at: new Date().toISOString(),
                    running_count: fleet.length,
                    delayed_count: delayedCount,
                    average_eta_minutes: averageEtaMinutes !== null ? Number(averageEtaMinutes.toFixed(1)) : null,
                    average_eta_text: averageEtaMinutes !== null ? EtaService.formatEtaMinutes(averageEtaMinutes) : 'No ETA data',
                    fleet
                }
            });
        } catch (error) {
            next(error);
        }
    },

    async getTripLiveSnapshot(req, res, next) {
        try {
            const { tripId } = req.params;
            const trip = await TripModel.getById(tripId);

            if (!trip) {
                return res.status(404).json({ success: false, message: 'Trip not found' });
            }

            if (req.user.role === 'driver') {
                const driver = await DriverModel.getByUserId(req.user.id);
                if (!driver || driver.driver_id !== trip.driver_id) {
                    return res.status(403).json({ success: false, message: 'You can only view live GPS for your own trips' });
                }
            }

            const liveView = await MockGpsService.getTripLiveView(trip, {
                force: req.query.force === 'true' && req.user.role !== 'driver'
            });

            res.json({ success: true, data: liveView });
        } catch (error) {
            next(error);
        }
    },

    async runMockTick(req, res, next) {
        try {
            const tripId = req.body.trip_id ? Number(req.body.trip_id) : null;
            const fleet = await MockGpsService.syncRunningTrips({ tripId, force: true });

            res.json({
                success: true,
                message: 'Mock GPS tick executed successfully',
                count: fleet.length,
                data: fleet
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = GpsController;
