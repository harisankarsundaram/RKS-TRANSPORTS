const DriverModel = require('../models/driverModel');
const TripModel = require('../models/tripModel');
const validators = require('../utils/validators');

const DriverController = {
    // POST /api/drivers - Create new driver
    async create(req, res, next) {
        try {
            const { name, phone, license_number, license_expiry, status } = req.body;

            // Validate required fields
            if (!name || !phone || !license_number || !license_expiry) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: name, phone, license_number, license_expiry'
                });
            }

            // Validate name
            const nameValidation = validators.isValidName(name);
            if (!nameValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: nameValidation.message
                });
            }

            // Validate Indian phone number
            const phoneValidation = validators.isValidPhoneNumber(phone);
            if (!phoneValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: phoneValidation.message
                });
            }

            // Validate Indian license number
            const licenseValidation = validators.isValidLicenseNumber(license_number);
            if (!licenseValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: licenseValidation.message
                });
            }

            // Validate unique license number
            const existingDriver = await DriverModel.findByLicenseNumber(licenseValidation.normalized);
            if (existingDriver) {
                return res.status(409).json({
                    success: false,
                    message: 'License number already exists'
                });
            }

            // Validate future expiry date
            const expiryValidation = validators.isFutureDate(license_expiry);
            if (!expiryValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: `License expiry: ${expiryValidation.message}`
                });
            }

            const driver = await DriverModel.create({
                name: nameValidation.normalized,
                phone: phoneValidation.normalized,
                license_number: licenseValidation.normalized,
                license_expiry,
                status: status || 'Available'
            });

            res.status(201).json({
                success: true,
                message: 'Driver created successfully',
                data: driver
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/drivers - Get all drivers
    async getAll(req, res, next) {
        try {
            const drivers = await DriverModel.getAll();
            res.json({
                success: true,
                count: drivers.length,
                data: drivers
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/drivers/:id - Get driver by ID
    async getById(req, res, next) {
        try {
            const { id } = req.params;
            const driver = await DriverModel.getById(id);

            if (!driver) {
                return res.status(404).json({
                    success: false,
                    message: 'Driver not found'
                });
            }

            res.json({
                success: true,
                data: driver
            });
        } catch (error) {
            next(error);
        }
    },

    // PUT /api/drivers/:id - Update driver
    async update(req, res, next) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            // Check if driver exists
            const driver = await DriverModel.getById(id);
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    message: 'Driver not found'
                });
            }

            // Validate name if being updated
            if (updateData.name) {
                const nameValidation = validators.isValidName(updateData.name);
                if (!nameValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: nameValidation.message
                    });
                }
                updateData.name = nameValidation.normalized;
            }

            // Validate phone if being updated
            if (updateData.phone) {
                const phoneValidation = validators.isValidPhoneNumber(updateData.phone);
                if (!phoneValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: phoneValidation.message
                    });
                }
                updateData.phone = phoneValidation.normalized;
            }

            // Validate license number if being updated
            if (updateData.license_number) {
                const licenseValidation = validators.isValidLicenseNumber(updateData.license_number);
                if (!licenseValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: licenseValidation.message
                    });
                }
                updateData.license_number = licenseValidation.normalized;

                const existingDriver = await DriverModel.findByLicenseNumber(licenseValidation.normalized, id);
                if (existingDriver) {
                    return res.status(409).json({
                        success: false,
                        message: 'License number already exists'
                    });
                }
            }

            // Validate future expiry date if being updated
            if (updateData.license_expiry) {
                const expiryValidation = validators.isFutureDate(updateData.license_expiry);
                if (!expiryValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: `License expiry: ${expiryValidation.message}`
                    });
                }
            }

            await DriverModel.update(id, updateData);
            const updatedDriver = await DriverModel.getById(id);

            res.json({
                success: true,
                message: 'Driver updated successfully',
                data: updatedDriver
            });
        } catch (error) {
            next(error);
        }
    },

    // DELETE /api/drivers/:id - Soft delete driver
    async delete(req, res, next) {
        try {
            const { id } = req.params;

            // Check if driver exists
            const driver = await DriverModel.getById(id);
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    message: 'Driver not found'
                });
            }

            // Check if driver is assigned to a truck
            if (driver.assigned_truck_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete driver that is assigned to a truck. Unassign the driver first.'
                });
            }

            // Check for active trips
            const activeTrip = await TripModel.getActiveTripByDriver(id);
            if (activeTrip) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot delete driver with an active trip (Trip #${activeTrip.trip_id} - ${activeTrip.status}). Complete or cancel the trip first.`
                });
            }

            await DriverModel.delete(id);

            res.json({
                success: true,
                message: 'Driver deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/drivers/user/:userId - Get driver profile by user ID
    async getByUserId(req, res, next) {
        try {
            const { userId } = req.params;
            const driver = await DriverModel.getByUserId(userId);

            if (!driver) {
                return res.status(404).json({
                    success: false,
                    message: 'Driver profile not found'
                });
            }

            res.json({
                success: true,
                data: driver
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = DriverController;
