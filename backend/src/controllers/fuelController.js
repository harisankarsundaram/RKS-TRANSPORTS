const FuelModel = require('../models/fuelModel');
const TripModel = require('../models/tripModel');

const FuelController = {
    // POST /api/fuel
    async logFuel(req, res, next) {
        try {
            const { trip_id, liters, price_per_liter } = req.body;

            if (!trip_id || !liters || !price_per_liter) {
                return res.status(400).json({ success: false, message: 'Missing fields: trip_id, liters, price_per_liter' });
            }

            const trip = await TripModel.getById(trip_id);
            if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

            const total_cost = parseFloat(liters) * parseFloat(price_per_liter);

            const fuelId = await FuelModel.create({
                trip_id,
                liters,
                price_per_liter,
                total_cost
            });

            res.status(201).json({
                success: true,
                message: 'Fuel log added',
                data: { fuel_id: fuelId, total_cost }
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/fuel
    async getAllFuelLogs(req, res, next) {
        try {
            const filters = {
                trip_id: req.query.trip,
                driver_id: req.query.driver_id,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            // Remove undefined filters
            Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

            const fuelLogs = await FuelModel.getAll(filters);
            res.json({ success: true, count: fuelLogs.length, data: fuelLogs });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/fuel/trip/:tripId
    async getFuelLogsByTrip(req, res, next) {
        try {
            const { tripId } = req.params;
            const fuelLogs = await FuelModel.getByTrip(tripId);
            res.json({ success: true, count: fuelLogs.length, data: fuelLogs });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/fuel/trip/:tripId/summary
    async getTripFuelSummary(req, res, next) {
        try {
            const { tripId } = req.params;

            const trip = await TripModel.getById(tripId);
            if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

            const summary = await FuelModel.getTripFuelSummary(tripId);
            const efficiency = await FuelModel.calculateFuelEfficiency(tripId);

            res.json({
                success: true,
                data: {
                    ...summary,
                    distance_km: efficiency.distance_km,
                    fuel_efficiency: parseFloat(efficiency.fuel_efficiency).toFixed(2),
                    fuel_efficiency_unit: 'km/liter'
                }
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/fuel/analytics/truck/:truckId
    async getTruckFuelAnalytics(req, res, next) {
        try {
            const { truckId } = req.params;
            const { dateFrom, dateTo } = req.query;

            const analytics = await FuelModel.getFuelAnalyticsByTruck(truckId, dateFrom, dateTo);

            res.json({
                success: true,
                data: {
                    ...analytics,
                    overall_fuel_efficiency: parseFloat(analytics.overall_fuel_efficiency).toFixed(2),
                    total_liters: parseFloat(analytics.total_liters).toFixed(2),
                    total_fuel_cost: parseFloat(analytics.total_fuel_cost).toFixed(2),
                    average_price_per_liter: parseFloat(analytics.average_price_per_liter).toFixed(2)
                }
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/fuel/analytics/driver/:driverId
    async getDriverFuelAnalytics(req, res, next) {
        try {
            const { driverId } = req.params;
            const { dateFrom, dateTo } = req.query;

            const analytics = await FuelModel.getFuelAnalyticsByDriver(driverId, dateFrom, dateTo);

            res.json({
                success: true,
                data: {
                    ...analytics,
                    overall_fuel_efficiency: parseFloat(analytics.overall_fuel_efficiency).toFixed(2),
                    total_liters: parseFloat(analytics.total_liters).toFixed(2),
                    total_fuel_cost: parseFloat(analytics.total_fuel_cost).toFixed(2),
                    average_price_per_liter: parseFloat(analytics.average_price_per_liter).toFixed(2)
                }
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/fuel/:id
    async getFuelLogById(req, res, next) {
        try {
            const { id } = req.params;
            const fuelLog = await FuelModel.getById(id);

            if (!fuelLog) {
                return res.status(404).json({ success: false, message: 'Fuel log not found' });
            }

            res.json({ success: true, data: fuelLog });
        } catch (error) {
            next(error);
        }
    },

    // PUT /api/fuel/:id
    async updateFuelLog(req, res, next) {
        try {
            const { id } = req.params;
            const updates = req.body;

            const fuelLog = await FuelModel.getById(id);
            if (!fuelLog) {
                return res.status(404).json({ success: false, message: 'Fuel log not found' });
            }

            const updatedFuelLog = await FuelModel.update(id, updates);
            if (!updatedFuelLog) {
                return res.status(400).json({ success: false, message: 'No valid fields to update' });
            }

            res.json({ success: true, message: 'Fuel log updated successfully', data: updatedFuelLog });
        } catch (error) {
            next(error);
        }
    },

    // DELETE /api/fuel/:id
    async deleteFuelLog(req, res, next) {
        try {
            const { id } = req.params;

            const fuelLog = await FuelModel.getById(id);
            if (!fuelLog) {
                return res.status(404).json({ success: false, message: 'Fuel log not found' });
            }

            const success = await FuelModel.delete(id);
            if (!success) {
                return res.status(500).json({ success: false, message: 'Failed to delete fuel log' });
            }

            res.json({ success: true, message: 'Fuel log deleted successfully' });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = FuelController;
