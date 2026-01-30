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

            await FuelModel.create({
                trip_id,
                liters,
                price_per_liter,
                total_cost
            });

            res.status(201).json({
                success: true,
                message: 'Fuel log added',
                data: { total_cost }
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = FuelController;
