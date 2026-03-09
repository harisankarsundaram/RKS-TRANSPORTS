const TruckModel = require('../models/truckModel');
const TripModel = require('../models/tripModel');
const validators = require('../utils/validators');

const TruckController = {
    // POST /api/trucks - Create new truck
    async create(req, res, next) {
        try {
            const { truck_number, capacity, status, insurance_expiry, fitness_expiry } = req.body;

            // Validate required fields
            if (!truck_number || !capacity || !insurance_expiry || !fitness_expiry) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: truck_number, capacity, insurance_expiry, fitness_expiry'
                });
            }

            // Validate Indian truck number format
            const truckValidation = validators.isValidTruckNumber(truck_number);
            if (!truckValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: truckValidation.message
                });
            }

            // Validate capacity
            const capacityValidation = validators.isValidCapacity(capacity);
            if (!capacityValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: capacityValidation.message
                });
            }

            // Validate unique truck number
            const existingTruck = await TruckModel.findByTruckNumber(truckValidation.normalized);
            if (existingTruck) {
                return res.status(409).json({
                    success: false,
                    message: 'Truck number already exists'
                });
            }

            // Validate future expiry dates
            const insuranceValidation = validators.isFutureDate(insurance_expiry);
            if (!insuranceValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: `Insurance expiry: ${insuranceValidation.message}`
                });
            }

            const fitnessValidation = validators.isFutureDate(fitness_expiry);
            if (!fitnessValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: `Fitness expiry: ${fitnessValidation.message}`
                });
            }

            const truck = await TruckModel.create({
                truck_number: truckValidation.normalized,
                capacity: capacityValidation.value,
                status: status || 'Available',
                insurance_expiry,
                fitness_expiry
            });

            res.status(201).json({
                success: true,
                message: 'Truck created successfully',
                data: truck
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trucks - Get all trucks
    async getAll(req, res, next) {
        try {
            const trucks = await TruckModel.getAll();
            res.json({
                success: true,
                count: trucks.length,
                data: trucks
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/trucks/:id - Get truck by ID
    async getById(req, res, next) {
        try {
            const { id } = req.params;
            const truck = await TruckModel.getById(id);

            if (!truck) {
                return res.status(404).json({
                    success: false,
                    message: 'Truck not found'
                });
            }

            res.json({
                success: true,
                data: truck
            });
        } catch (error) {
            next(error);
        }
    },

    // PUT /api/trucks/:id - Update truck
    async update(req, res, next) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            // Check if truck exists
            const truck = await TruckModel.getById(id);
            if (!truck) {
                return res.status(404).json({
                    success: false,
                    message: 'Truck not found'
                });
            }

            // Validate truck number if being updated
            if (updateData.truck_number) {
                const truckValidation = validators.isValidTruckNumber(updateData.truck_number);
                if (!truckValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: truckValidation.message
                    });
                }
                updateData.truck_number = truckValidation.normalized;

                const existingTruck = await TruckModel.findByTruckNumber(truckValidation.normalized, id);
                if (existingTruck) {
                    return res.status(409).json({
                        success: false,
                        message: 'Truck number already exists'
                    });
                }
            }

            // Validate capacity if being updated
            if (updateData.capacity !== undefined) {
                const capacityValidation = validators.isValidCapacity(updateData.capacity);
                if (!capacityValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: capacityValidation.message
                    });
                }
                updateData.capacity = capacityValidation.value;
            }

            // Validate future expiry dates if being updated
            if (updateData.insurance_expiry) {
                const insuranceValidation = validators.isFutureDate(updateData.insurance_expiry);
                if (!insuranceValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: `Insurance expiry: ${insuranceValidation.message}`
                    });
                }
            }

            if (updateData.fitness_expiry) {
                const fitnessValidation = validators.isFutureDate(updateData.fitness_expiry);
                if (!fitnessValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: `Fitness expiry: ${fitnessValidation.message}`
                    });
                }
            }

            // Handle status changes
            if (updateData.status) {
                // Prevent status changes on trucks with active trips
                const activeTrip = await TripModel.getActiveTripByTruck(id);
                if (activeTrip && updateData.status !== truck.status) {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot change truck status. It has an active trip (Trip #${activeTrip.trip_id} - ${activeTrip.status}). Complete or cancel the trip first.`
                    });
                }

                // If changing from Assigned to Available/Maintenance, unassign the driver
                if (truck.status === 'Assigned' && updateData.status !== 'Assigned') {
                    const DriverModel = require('../models/driverModel');
                    const driverId = await TruckModel.getAssignedDriver(id);

                    if (driverId) {
                        await DriverModel.unassignTruck(driverId);
                    }
                }
            }

            await TruckModel.update(id, updateData);
            const updatedTruck = await TruckModel.getById(id);

            res.json({
                success: true,
                message: 'Truck updated successfully',
                data: updatedTruck
            });
        } catch (error) {
            next(error);
        }
    },

    // DELETE /api/trucks/:id - Soft delete truck
    async delete(req, res, next) {
        try {
            const { id } = req.params;

            // Check if truck exists
            const truck = await TruckModel.getById(id);
            if (!truck) {
                return res.status(404).json({
                    success: false,
                    message: 'Truck not found'
                });
            }

            // Check if truck is assigned to a driver
            const hasDriver = await TruckModel.hasAssignedDriver(id);
            if (hasDriver) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete truck that is assigned to a driver. Unassign the driver first.'
                });
            }

            await TruckModel.delete(id);

            res.json({
                success: true,
                message: 'Truck deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = TruckController;
