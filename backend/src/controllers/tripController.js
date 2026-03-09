const TripModel = require('../models/tripModel');
const TruckModel = require('../models/truckModel');
const DriverModel = require('../models/driverModel');
const ExpenseModel = require('../models/expenseModel');
const InvoiceModel = require('../models/invoiceModel');
const NotificationModel = require('../models/notificationModel');
const FinanceService = require('../services/financeService');

// Helper for date validation
const isValidDate = (d) => d instanceof Date && !isNaN(d);

const TripController = {
    // POST /api/trips
    async createTrip(req, res, next) {
        try {
            const {
                truck_id, driver_id, lr_number, source, destination,
                freight_amount, base_freight,
                toll_amount,
                loading_cost,
                unloading_cost,
                fast_tag,
                gst_percentage, driver_bata,
                empty_km, loaded_km
            } = req.body;

            // 1. Validate Basic Inputs
            if (!truck_id || !driver_id || !lr_number || !source || !destination) {
                return res.status(400).json({ success: false, message: 'Required fields: truck_id, driver_id, lr_number, source, destination' });
            }

            // Must have either freight_amount or base_freight
            const effectiveFreight = base_freight || freight_amount;
            if (!effectiveFreight || parseFloat(effectiveFreight) <= 0) {
                return res.status(400).json({ success: false, message: 'base_freight (or freight_amount) is required and must be > 0' });
            }

            // 2. Validate truck is available
            const truck = await TruckModel.getById(truck_id);
            if (!truck) return res.status(404).json({ success: false, message: 'Truck not found' });
            if (truck.status !== 'Available') {
                return res.status(400).json({ success: false, message: `Truck ${truck.truck_number} is not available (current status: ${truck.status})` });
            }

            // 3. Validate driver is available
            const driver = await DriverModel.getById(driver_id);
            if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });
            if (driver.status !== 'Available') {
                return res.status(400).json({ success: false, message: `Driver ${driver.name} is not available (current status: ${driver.status})` });
            }

            // 4. Check for Active Trips
            const activeTrip = await TripModel.getActiveTripByTruck(truck_id);
            if (activeTrip) {
                return res.status(409).json({ success: false, message: `Truck is already on an active trip (Trip ID: ${activeTrip.trip_id})` });
            }
            const activeDriverTrip = await TripModel.getActiveTripByDriver(driver_id);
            if (activeDriverTrip) {
                return res.status(409).json({ success: false, message: `Driver already has an active trip (Trip ID: ${activeDriverTrip.trip_id})` });
            }

            // 5. Check Unique LR Number
            const existingLr = await TripModel.findByLRNumber(lr_number);
            if (existingLr) {
                return res.status(409).json({ success: false, message: 'LR Number already exists' });
            }

            // 6. Auto-assign driver to truck
            await DriverModel.assignTruck(driver_id, truck_id);
            await TruckModel.updateStatus(truck_id, 'Assigned');

            // 7. Create Planned Trip with all financial fields
            const trip = await TripModel.create({
                truck_id,
                driver_id,
                lr_number,
                source,
                destination,
                freight_amount: effectiveFreight,
                base_freight: effectiveFreight,
                toll_amount,
                loading_cost,
                unloading_cost,
                fast_tag,
                gst_percentage, driver_bata,
                empty_km, loaded_km
            });

            // 8. Notify the driver about the assigned trip
            if (driver.user_id) {
                await NotificationModel.create({
                    user_id: driver.user_id,
                    message: `Trip ${lr_number} assigned: ${source} → ${destination} (Freight: ₹${effectiveFreight})`,
                    type: 'trip_assigned',
                    related_trip_id: trip.trip_id
                });
            }

            res.status(201).json({ success: true, message: 'Trip planned successfully. Driver and truck paired automatically.', data: trip });

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

            // If driver role, verify they own this trip
            if (req.user.role === 'driver') {
                const driver = await DriverModel.getByUserId(req.user.id);
                if (!driver || driver.driver_id !== trip.driver_id) {
                    return res.status(403).json({ success: false, message: 'You can only start your own trips' });
                }
            }

            // Verify truck is not in maintenance
            const truck = await TruckModel.getById(trip.truck_id);
            if (!truck || truck.status === 'Maintenance') {
                return res.status(400).json({ success: false, message: 'Truck is not available to start this trip' });
            }

            await TripModel.start(id);

            // Notify all admins that the driver started the trip
            const driver = await DriverModel.getById(trip.driver_id);
            await NotificationModel.createForRole('admin', {
                message: `${driver?.name || 'Driver'} started Trip ${trip.lr_number} (${trip.source} → ${trip.destination})`,
                type: 'trip_started',
                related_trip_id: trip.trip_id
            });

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

            // If driver role, verify they own this trip
            if (req.user.role === 'driver') {
                const driver = await DriverModel.getByUserId(req.user.id);
                if (!driver || driver.driver_id !== trip.driver_id) {
                    return res.status(403).json({ success: false, message: 'You can only complete your own trips' });
                }
            }

            // Complete trip and free up driver + truck
            await TripModel.end(id);
            await DriverModel.unassignTruck(trip.driver_id);
            await TruckModel.updateStatus(trip.truck_id, 'Available');

            // Notify all admins that the driver completed the trip
            const driver = await DriverModel.getById(trip.driver_id);
            await NotificationModel.createForRole('admin', {
                message: `${driver?.name || 'Driver'} completed Trip ${trip.lr_number} (${trip.source} → ${trip.destination})`,
                type: 'trip_completed',
                related_trip_id: trip.trip_id
            });

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

            // Free driver and truck since trip is cancelled
            await DriverModel.unassignTruck(trip.driver_id);
            await TruckModel.updateStatus(trip.truck_id, 'Available');

            // Notify the driver about cancellation
            const driver = await DriverModel.getById(trip.driver_id);
            if (driver?.user_id) {
                await NotificationModel.create({
                    user_id: driver.user_id,
                    message: `Trip ${trip.lr_number} (${trip.source} → ${trip.destination}) has been cancelled`,
                    type: 'trip_cancelled',
                    related_trip_id: trip.trip_id
                });
            }

            res.json({ success: true, message: 'Trip cancelled successfully. Driver and truck freed.' });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trips
    async getAllTrips(req, res, next) {
        try {
            const filters = {
                status: req.query.status,
                driver_id: req.query.driver || req.query.driver_id,
                truck_id: req.query.truck,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

            const trips = await TripModel.getAll(filters);
            res.json({ success: true, count: trips.length, data: trips });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trips/:id — with financial summary
    async getTripById(req, res, next) {
        try {
            const { id } = req.params;
            const trip = await TripModel.getById(id);
            if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

            // Enrich with financial summary
            const expenseTotal = await ExpenseModel.getTotalByTrip(id);
            const invoice = await InvoiceModel.getByTripId(id);
            const internalCost = FinanceService.calculateInternalCost(trip, expenseTotal);
            const deadMileage = FinanceService.calculateDeadMileage(trip.empty_km, trip.loaded_km);

            const financials = {
                expense_total: expenseTotal,
                internal_cost: internalCost,
                dead_mileage_pct: deadMileage,
                invoice: invoice || null,
                profit: invoice ? FinanceService.calculateProfit(invoice.total_amount, internalCost) : null
            };

            res.json({ success: true, data: { ...trip, financials } });
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

    // GET /api/trips/analytics/summary — Enhanced with financial KPIs
    async getTripAnalytics(req, res, next) {
        try {
            const filters = {
                driver_id: req.query.driver,
                truck_id: req.query.truck,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

            const analytics = await TripModel.getTripAnalytics(filters);
            const invoiceTotals = await InvoiceModel.getDashboardTotals();
            const expenseTotals = await ExpenseModel.getGlobalTotals();
            const availableCount = await TruckModel.getAvailableCount();

            const totalRevenue = parseFloat(invoiceTotals.total_revenue) || 0;
            const totalExpenses = parseFloat(expenseTotals.total_expenses) || 0;

            res.json({
                success: true,
                data: {
                    total_revenue: totalRevenue,
                    total_outstanding: parseFloat(invoiceTotals.total_outstanding) || 0,
                    total_expenses: totalExpenses,
                    net_profit: FinanceService.calculateProfit(totalRevenue, totalExpenses),
                    average_dead_mileage_percent: analytics.avg_dead_mileage_pct || 0,
                    running_trips_count: parseInt(analytics.running_trips) || 0,
                    available_trucks_count: availableCount
                }
            });
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
