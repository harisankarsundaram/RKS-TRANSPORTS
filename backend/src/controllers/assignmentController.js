const DriverModel = require('../models/driverModel');
const TruckModel = require('../models/truckModel');
const TripModel = require('../models/tripModel');

const AssignmentController = {
    // POST /api/assign-driver - Assign driver to truck
    async assignDriver(req, res, next) {
        try {
            const { driver_id, truck_id } = req.body;

            // Validate required fields
            if (!driver_id || !truck_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: driver_id, truck_id'
                });
            }

            // Get driver
            const driver = await DriverModel.getById(driver_id);
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    message: 'Driver not found'
                });
            }

            // Get truck
            const truck = await TruckModel.getById(truck_id);
            if (!truck) {
                return res.status(404).json({
                    success: false,
                    message: 'Truck not found'
                });
            }

            // Check if driver is available
            if (driver.status !== 'Available') {
                return res.status(400).json({
                    success: false,
                    message: 'Driver is not available for assignment'
                });
            }

            // Check if truck is available
            if (truck.status !== 'Available') {
                return res.status(400).json({
                    success: false,
                    message: truck.status === 'Maintenance'
                        ? 'Cannot assign truck under maintenance'
                        : 'Truck is not available for assignment'
                });
            }

            // Check if truck already has a driver
            const hasDriver = await TruckModel.hasAssignedDriver(truck_id);
            if (hasDriver) {
                return res.status(400).json({
                    success: false,
                    message: 'Truck already has an assigned driver'
                });
            }

            // Assign truck to driver and update statuses
            await DriverModel.assignTruck(driver_id, truck_id);
            await TruckModel.updateStatus(truck_id, 'Assigned');

            // Get updated records
            const updatedDriver = await DriverModel.getById(driver_id);
            const updatedTruck = await TruckModel.getById(truck_id);

            res.json({
                success: true,
                message: 'Driver assigned to truck successfully',
                data: {
                    driver: updatedDriver,
                    truck: updatedTruck
                }
            });
        } catch (error) {
            next(error);
        }
    },

    // POST /api/unassign-driver - Unassign driver from truck
    async unassignDriver(req, res, next) {
        try {
            const { driver_id } = req.body;

            // Validate required field
            if (!driver_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required field: driver_id'
                });
            }

            // Get driver
            const driver = await DriverModel.getById(driver_id);
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    message: 'Driver not found'
                });
            }

            // Check if driver is assigned
            if (!driver.assigned_truck_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Driver is not assigned to any truck'
                });
            }

            // Check for active trips before unassigning
            const activeTrip = await TripModel.getActiveTripByDriver(driver_id);
            if (activeTrip) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot unassign driver with an active trip (Trip #${activeTrip.trip_id} - ${activeTrip.status}). Complete or cancel the trip first.`
                });
            }

            const truckId = driver.assigned_truck_id;

            // Unassign truck from driver and update statuses
            await DriverModel.unassignTruck(driver_id);
            await TruckModel.updateStatus(truckId, 'Available');

            // Get updated records
            const updatedDriver = await DriverModel.getById(driver_id);
            const updatedTruck = await TruckModel.getById(truckId);

            res.json({
                success: true,
                message: 'Driver unassigned from truck successfully',
                data: {
                    driver: updatedDriver,
                    truck: updatedTruck
                }
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = AssignmentController;
