const ExpenseModel = require('../models/expenseModel');
const TripModel = require('../models/tripModel');
const TruckModel = require('../models/truckModel');

const VALID_CATEGORIES = ['Fuel', 'Toll', 'Maintenance', 'Driver', 'RTO', 'Insurance', 'Misc'];

const ExpenseController = {
    // POST /api/expenses - Add expense
    async addExpense(req, res, next) {
        try {
            const { trip_id, truck_id, category, amount, description } = req.body;

            if (!category || !amount) {
                return res.status(400).json({ success: false, message: 'Missing required fields: category, amount' });
            }

            if (!VALID_CATEGORIES.includes(category)) {
                return res.status(400).json({ success: false, message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
            }

            if (parseFloat(amount) <= 0) {
                return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
            }

            // Validate trip if provided
            if (trip_id) {
                const trip = await TripModel.getById(trip_id);
                if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
            }

            // Validate truck if provided
            if (truck_id) {
                const truck = await TruckModel.getById(truck_id);
                if (!truck) return res.status(404).json({ success: false, message: 'Truck not found' });
            }

            const expense = await ExpenseModel.create({ trip_id, truck_id, category, amount, description });

            res.status(201).json({
                success: true,
                message: 'Expense added successfully',
                data: expense
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/expenses - List all expenses with filters
    async getAll(req, res, next) {
        try {
            const filters = {
                trip_id: req.query.trip_id,
                truck_id: req.query.truck_id,
                category: req.query.category,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

            const expenses = await ExpenseModel.getAll(filters);
            res.json({ success: true, count: expenses.length, data: expenses });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/expenses/trip/:tripId - Expenses for a trip
    async getByTrip(req, res, next) {
        try {
            const { tripId } = req.params;
            const expenses = await ExpenseModel.getByTrip(tripId);
            const total = await ExpenseModel.getTotalByTrip(tripId);

            res.json({
                success: true,
                count: expenses.length,
                total,
                data: expenses
            });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/expenses/summary - Category-wise totals
    async getCategorySummary(req, res, next) {
        try {
            const filters = {
                trip_id: req.query.trip_id,
                truck_id: req.query.truck_id,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

            const summary = await ExpenseModel.getTotalByCategory(filters);
            const globalTotals = await ExpenseModel.getGlobalTotals();

            res.json({
                success: true,
                data: {
                    categories: summary,
                    ...globalTotals
                }
            });
        } catch (error) {
            next(error);
        }
    },

    // DELETE /api/expenses/:id - Remove expense
    async deleteExpense(req, res, next) {
        try {
            const { id } = req.params;

            const expense = await ExpenseModel.getById(id);
            if (!expense) {
                return res.status(404).json({ success: false, message: 'Expense not found' });
            }

            await ExpenseModel.delete(id);
            res.json({ success: true, message: 'Expense deleted successfully' });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = ExpenseController;
