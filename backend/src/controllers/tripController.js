const TripModel = require('../models/tripModel');
const TruckModel = require('../models/truckModel');

// Helper for date validation
const isValidDate = (d) => d instanceof Date && !isNaN(d);

const TripController = {
    // POST /api/trips
    async createTrip(req, res, next) {
        try {
            const { truck_id, driver_id, lr_number, source, destination, freight_amount } = req.body;

            // 1. Validate Basic Inputs
            if (!truck_id || !driver_id || !lr_number || !source || !destination || !freight_amount) {
                return res.status(400).json({ success: false, message: 'All fields (truck_id, driver_id, lr_number, source, destination, freight_amount) are required' });
            }

            // 2. Validate Truck/Driver Assignment
            const assignedDriverId = await TruckModel.getAssignedDriver(truck_id);
            if (parseInt(assignedDriverId) !== parseInt(driver_id)) {
                return res.status(400).json({ success: false, message: 'This driver is not currently assigned to the selected truck' });
            }

            // 3. Check for Active Trips
            const activeTrip = await TripModel.getActiveTripByTruck(truck_id);
            if (activeTrip) {
                return res.status(409).json({ success: false, message: `Truck is already on an active trip (Trip ID: ${activeTrip.trip_id})` });
            }

            // 4. Check Unique LR Number
            const existingLr = await TripModel.findByLRNumber(lr_number);
            if (existingLr) {
                return res.status(409).json({ success: false, message: 'LR Number already exists' });
            }

            // 5. Create Planned Trip
            const trip = await TripModel.create({
                truck_id,
                driver_id,
                lr_number,
                source,
                destination,
                freight_amount
            });

            res.status(201).json({ success: true, message: 'Trip planned successfully', data: trip });

        } catch (error) {
            next(error);
        }
    },

    // POST /api/trips/:id/start
    async startTrip(req, res, next) {
        try {
            const { id } = req.params;
            const trip = await TripModel.getById(id);

            if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
            if (trip.status !== 'Planned') return res.status(400).json({ success: false, message: `Cannot start trip with status '${trip.status}'` });

            await TripModel.start(id);
            res.json({ success: true, message: 'Trip started successfully. Status updated to Running.' });
        } catch (error) {
            next(error);
        }
    },

    // POST /api/trips/:id/end
    async endTrip(req, res, next) {
        try {
            const { id } = req.params;
            const trip = await TripModel.getById(id);

            if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
            if (trip.status !== 'Running') return res.status(400).json({ success: false, message: `Cannot end trip with status '${trip.status}'` });

            await TripModel.end(id);

            const DriverModel = require('../models/driverModel');
            await DriverModel.unassignTruck(trip.driver_id);

            res.json({ success: true, message: 'Trip completed. Truck and Driver unassigned and marked Available.' });
        } catch (error) {
            next(error);
        }
    },

    // POST /api/trips/:id/cancel
    async cancelTrip(req, res, next) {
        try {
            const { id } = req.params;
            const trip = await TripModel.getById(id);

            if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
            if (trip.status !== 'Planned') {
                return res.status(400).json({ success: false, message: `Cannot cancel trip with status '${trip.status}'. Only planned trips can be cancelled.` });
            }

            const success = await TripModel.cancel(id);
            if (!success) {
                return res.status(500).json({ success: false, message: 'Failed to cancel trip' });
            }

            res.json({ success: true, message: 'Trip cancelled successfully' });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trips
    async getAllTrips(req, res, next) {
        try {
            const filters = {
                status: req.query.status,
                driver_id: req.query.driver,
                truck_id: req.query.truck,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            // Remove undefined filters
            Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

            const trips = await TripModel.getAll(filters);
            res.json({ success: true, count: trips.length, data: trips });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trips/:id
    async getTripById(req, res, next) {
        try {
            const { id } = req.params;
            const trip = await TripModel.getById(id);
            if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
            res.json({ success: true, data: trip });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trips/driver/:driverId
    async getTripsByDriver(req, res, next) {
        try {
            const { driverId } = req.params;
            const trips = await TripModel.getByDriver(driverId);
            res.json({ success: true, count: trips.length, data: trips });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trips/truck/:truckId
    async getTripsByTruck(req, res, next) {
        try {
            const { truckId } = req.params;
            const trips = await TripModel.getByTruck(truckId);
            res.json({ success: true, count: trips.length, data: trips });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trips/analytics
    async getTripAnalytics(req, res, next) {
        try {
            const filters = {
                driver_id: req.query.driver,
                truck_id: req.query.truck,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            // Remove undefined filters
            Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

            const analytics = await TripModel.getTripAnalytics(filters);
            res.json({ success: true, data: analytics });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trips/driver/:driverId/history
    async getDriverTripHistory(req, res, next) {
        try {
            const { driverId } = req.params;
            const history = await TripModel.getDriverTripHistory(driverId);
            res.json({ success: true, data: history });
        } catch (error) {
            next(error);
        }
    },

    // PUT /api/trips/:id
    async updateTrip(req, res, next) {
        try {
            const { id } = req.params;
            const updates = req.body;

            const trip = await TripModel.getById(id);
            if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

            const success = await TripModel.updateTripDetails(id, updates);
            if (!success) {
                return res.status(400).json({ success: false, message: 'No valid fields to update' });
            }

            const updatedTrip = await TripModel.getById(id);
            res.json({ success: true, message: 'Trip updated successfully', data: updatedTrip });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = TripController;
