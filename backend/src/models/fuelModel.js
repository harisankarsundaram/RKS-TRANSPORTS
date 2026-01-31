const pool = require('../config/db');

const FuelModel = {
    // Create fuel log entry
    async create(fuelData) {
        const { trip_id, liters, price_per_liter, total_cost } = fuelData;
        const result = await pool.query(
            `INSERT INTO fuel_logs (trip_id, liters, price_per_liter, total_cost, created_at) 
             VALUES ($1, $2, $3, $4, NOW()) RETURNING fuel_id`,
            [trip_id, liters, price_per_liter, total_cost]
        );
        return result.rows[0].fuel_id;
    },

    // Get all fuel logs for a specific trip
    async getByTrip(tripId) {
        const result = await pool.query(
            `SELECT * FROM fuel_logs 
             WHERE trip_id = $1 
             ORDER BY created_at ASC`,
            [tripId]
        );
        return result.rows;
    },

    // Get fuel summary for a trip
    async getTripFuelSummary(tripId) {
        const result = await pool.query(
            `SELECT 
                trip_id,
                COUNT(*) as fuel_entries,
                COALESCE(SUM(liters), 0) as total_liters,
                COALESCE(SUM(total_cost), 0) as total_cost,
                COALESCE(AVG(price_per_liter), 0) as average_price_per_liter
             FROM fuel_logs
             WHERE trip_id = $1
             GROUP BY trip_id`,
            [tripId]
        );
        return result.rows[0] || {
            trip_id: tripId,
            fuel_entries: 0,
            total_liters: 0,
            total_cost: 0,
            average_price_per_liter: 0
        };
    },

    // Calculate fuel efficiency for a trip (km/liter)
    async calculateFuelEfficiency(tripId) {
        const result = await pool.query(
            `SELECT 
                t.trip_id,
                t.distance_km,
                COALESCE(SUM(f.liters), 0) as total_liters,
                CASE 
                    WHEN SUM(f.liters) > 0 THEN t.distance_km / SUM(f.liters)
                    ELSE 0
                END as fuel_efficiency
             FROM trips t
             LEFT JOIN fuel_logs f ON t.trip_id = f.trip_id
             WHERE t.trip_id = $1
             GROUP BY t.trip_id, t.distance_km`,
            [tripId]
        );
        return result.rows[0] || { trip_id: tripId, distance_km: 0, total_liters: 0, fuel_efficiency: 0 };
    },

    // Get fuel analytics by truck
    async getFuelAnalyticsByTruck(truckId, startDate = null, endDate = null) {
        let query = `
            SELECT 
                t.truck_id,
                tr.truck_number,
                COUNT(DISTINCT t.trip_id) as total_trips,
                COUNT(f.fuel_id) as total_fuel_entries,
                COALESCE(SUM(f.liters), 0) as total_liters,
                COALESCE(SUM(f.total_cost), 0) as total_fuel_cost,
                COALESCE(AVG(f.price_per_liter), 0) as average_price_per_liter,
                COALESCE(SUM(t.distance_km), 0) as total_distance,
                CASE 
                    WHEN SUM(f.liters) > 0 THEN SUM(t.distance_km) / SUM(f.liters)
                    ELSE 0
                END as overall_fuel_efficiency
            FROM trips t
            JOIN trucks tr ON t.truck_id = tr.truck_id
            LEFT JOIN fuel_logs f ON t.trip_id = f.trip_id
            WHERE t.truck_id = $1 AND t.status = 'Completed'
        `;

        const params = [truckId];
        let paramIndex = 2;

        if (startDate) {
            query += ` AND t.created_at >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND t.created_at <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        query += ` GROUP BY t.truck_id, tr.truck_number`;

        const result = await pool.query(query, params);
        return result.rows[0] || {
            truck_id: truckId,
            total_trips: 0,
            total_fuel_entries: 0,
            total_liters: 0,
            total_fuel_cost: 0,
            average_price_per_liter: 0,
            total_distance: 0,
            overall_fuel_efficiency: 0
        };
    },

    // Get fuel analytics by driver
    async getFuelAnalyticsByDriver(driverId, startDate = null, endDate = null) {
        let query = `
            SELECT 
                t.driver_id,
                d.name as driver_name,
                COUNT(DISTINCT t.trip_id) as total_trips,
                COUNT(f.fuel_id) as total_fuel_entries,
                COALESCE(SUM(f.liters), 0) as total_liters,
                COALESCE(SUM(f.total_cost), 0) as total_fuel_cost,
                COALESCE(AVG(f.price_per_liter), 0) as average_price_per_liter,
                COALESCE(SUM(t.distance_km), 0) as total_distance,
                CASE 
                    WHEN SUM(f.liters) > 0 THEN SUM(t.distance_km) / SUM(f.liters)
                    ELSE 0
                END as overall_fuel_efficiency
            FROM trips t
            JOIN drivers d ON t.driver_id = d.driver_id
            LEFT JOIN fuel_logs f ON t.trip_id = f.trip_id
            WHERE t.driver_id = $1 AND t.status = 'Completed'
        `;

        const params = [driverId];
        let paramIndex = 2;

        if (startDate) {
            query += ` AND t.created_at >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND t.created_at <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        query += ` GROUP BY t.driver_id, d.name`;

        const result = await pool.query(query, params);
        return result.rows[0] || {
            driver_id: driverId,
            total_trips: 0,
            total_fuel_entries: 0,
            total_liters: 0,
            total_fuel_cost: 0,
            average_price_per_liter: 0,
            total_distance: 0,
            overall_fuel_efficiency: 0
        };
    },

    // Get fuel log by ID
    async getById(fuelId) {
        const result = await pool.query(
            `SELECT * FROM fuel_logs WHERE fuel_id = $1`,
            [fuelId]
        );
        return result.rows[0] || null;
    },

    // Update fuel log entry
    async update(fuelId, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        const allowedFields = ['liters', 'price_per_liter', 'total_cost'];

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = $${paramIndex}`);
                values.push(updates[field]);
                paramIndex++;
            }
        }

        if (fields.length === 0) {
            return null;
        }

        // Recalculate total_cost if liters or price_per_liter is updated
        if (updates.liters !== undefined || updates.price_per_liter !== undefined) {
            const current = await this.getById(fuelId);
            if (current) {
                const newLiters = updates.liters !== undefined ? updates.liters : current.liters;
                const newPrice = updates.price_per_liter !== undefined ? updates.price_per_liter : current.price_per_liter;
                const newTotalCost = newLiters * newPrice;

                // Add or update total_cost in the update
                const totalCostIndex = fields.findIndex(f => f.startsWith('total_cost'));
                if (totalCostIndex >= 0) {
                    values[totalCostIndex] = newTotalCost;
                } else {
                    fields.push(`total_cost = $${paramIndex}`);
                    values.push(newTotalCost);
                    paramIndex++;
                }
            }
        }

        values.push(fuelId);

        const result = await pool.query(
            `UPDATE fuel_logs SET ${fields.join(', ')} WHERE fuel_id = $${paramIndex} RETURNING *`,
            values
        );

        return result.rows[0] || null;
    },

    // Delete fuel log entry
    async delete(fuelId) {
        const result = await pool.query(
            `DELETE FROM fuel_logs WHERE fuel_id = $1`,
            [fuelId]
        );
        return result.rowCount > 0;
    },

    // Get all fuel logs with optional filtering
    async getAll(filters = {}) {
        let query = `
            SELECT f.*, t.lr_number, t.source, t.destination, tr.truck_number, d.name as driver_name
            FROM fuel_logs f
            JOIN trips t ON f.trip_id = t.trip_id
            JOIN trucks tr ON t.truck_id = tr.truck_id
            JOIN drivers d ON t.driver_id = d.driver_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (filters.trip_id) {
            query += ` AND f.trip_id = $${paramIndex}`;
            params.push(filters.trip_id);
            paramIndex++;
        }

        if (filters.driver_id) {
            query += ` AND t.driver_id = $${paramIndex}`;
            params.push(filters.driver_id);
            paramIndex++;
        }

        if (filters.dateFrom) {
            query += ` AND f.created_at >= $${paramIndex}`;
            params.push(filters.dateFrom);
            paramIndex++;
        }

        if (filters.dateTo) {
            query += ` AND f.created_at <= $${paramIndex}`;
            params.push(filters.dateTo);
            paramIndex++;
        }

        query += ` ORDER BY f.created_at DESC`;

        const result = await pool.query(query, params);
        return result.rows;
    }
};

module.exports = FuelModel;
