const { mockTrackingProvider } = require('../services/mockTrackingProvider');

const MockTrackingController = {
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
