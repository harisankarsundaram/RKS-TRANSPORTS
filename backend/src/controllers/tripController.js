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
            // Ensure this specific driver is actually assigned to this truck
            const assignedDriverId = await TruckModel.getAssignedDriver(truck_id);
            if (parseInt(assignedDriverId) !== parseInt(driver_id)) {
                return res.status(400).json({ success: false, message: 'This driver is not currently assigned to the selected truck' });
            }

            // 3. Check for Active Trips (Truck cannot be in two trips)
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

            // End Trip
            await TripModel.end(id);

            // AUTOMATION: Automatically make truck and driver available? 
            // Implementation Plan rule: "On end: truck.status -> 'Available', driver.status -> 'Available'"
            // HOWEVER, business rule says "Assignment" stays until unassigned.
            // Let's keep them 'Updated' but maybe ready for next load.
            // Actually, per module requirements: "On end: truck.status -> 'Available'" implies Unassign OR just 'Ready'.
            // Given earlier logic, 'Assigned' is a distinct status from 'Available'.
            // Let's assume they stay 'Assigned' but the TRIP is done.
            // Wait, the Requirement said: "On end: truck.status -> 'Available', driver.status -> 'Available'". 
            // This implies UNASSIGNMENT. Let's strictly follow requirement.

            const DriverModel = require('../models/driverModel');
            await DriverModel.unassignTruck(trip.driver_id); // This sets Truck and Driver status to 'Available'

            res.json({ success: true, message: 'Trip completed. Truck and Driver unassigned and marked Available.' });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trips
    async getAllTrips(req, res, next) {
        try {
            const trips = await TripModel.getAll();
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
    }
};

module.exports = TripController;
