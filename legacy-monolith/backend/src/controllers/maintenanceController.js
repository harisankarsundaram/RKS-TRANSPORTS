const MaintenanceModel = require('../models/maintenanceModel');
const TruckModel = require('../models/truckModel');
const TripModel = require('../models/tripModel');

const MaintenanceController = {
    // POST /api/maintenance
    async logMaintenance(req, res, next) {
        try {
            const { truck_id, service_date, description, cost } = req.body;

            if (!truck_id || !service_date || !description || !cost) {
                return res.status(400).json({ success: false, message: 'Missing fields' });
            }

            // check truck exists
            const truck = await TruckModel.getById(truck_id);
            if (!truck) return res.status(404).json({ success: false, message: 'Truck not found' });

            // Check for active trips before allowing maintenance
            const activeTrip = await TripModel.getActiveTripByTruck(truck_id);
            if (activeTrip) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot set truck to maintenance. It has an active trip (Trip #${activeTrip.trip_id} - ${activeTrip.status}). Complete or cancel the trip first.`
                });
            }

            // Create Log
            await MaintenanceModel.create({ truck_id, service_date, description, cost });

            // AUTO-UPDATE: Set Truck Status to 'Maintenance'
            await TruckModel.updateStatus(truck_id, 'Maintenance');

            res.status(201).json({
                success: true,
                message: 'Maintenance logged. Truck status updated to Maintenance.'
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/maintenance
    async getAllMaintenance(req, res, next) {
        try {
            const logs = await MaintenanceModel.getAll();
            res.json({ success: true, data: logs });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = MaintenanceController;
