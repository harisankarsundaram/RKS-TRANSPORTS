const pool = require('../config/db');

const TripModel = {
    // Create Validated Trip (with financial fields)
    async create(tripData) {
        const {
            truck_id, driver_id, lr_number, source, destination,
            base_freight,
            toll_amount, toll_billable,
            loading_cost, loading_billable,
            unloading_cost, unloading_billable,
            other_charges, other_billable,
            gst_percentage, driver_bata,
            empty_km, loaded_km
        } = tripData;

        const result = await pool.query(
            `INSERT INTO trips (
                truck_id, driver_id, lr_number, source, destination,
                base_freight,
                toll_amount, toll_billable,
                loading_cost, loading_billable,
                unloading_cost, unloading_billable,
                other_charges, other_billable,
                gst_percentage, driver_bata,
                empty_km, loaded_km,
                status, created_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6,
                $7, $8,
                $9, $10,
                $11, $12,
                $13, $14,
                $15, $16,
                $17, $18,
                'Planned', NOW()
            ) RETURNING trip_id`,
            [
                truck_id, driver_id, lr_number, source, destination,
                base_freight || 0,
                toll_amount || 0, toll_billable || false,
                loading_cost || 0, loading_billable || false,
                unloading_cost || 0, unloading_billable || false,
                other_charges || 0, other_billable || false,
                gst_percentage || 0, driver_bata || 0,
                empty_km || 0, loaded_km || 0
            ]
        );
        return { trip_id: result.rows[0].trip_id, ...tripData, status: 'Planned' };
    },

    // Check for existing active trip for truck
    async getActiveTripByTruck(truckId) {
        const result = await pool.query(
            `SELECT * FROM trips WHERE truck_id = $1 AND status IN ('Planned', 'Running')`,
            [truckId]
        );
        return result.rows[0] || null;
    },

    // Check for duplicate LR number
    async findByLRNumber(lrNumber) {
        const result = await pool.query(
            `SELECT * FROM trips WHERE lr_number = $1`,
            [lrNumber]
        );
        return result.rows[0] || null;
    },

    // Start Trip
    async start(tripId) {
        const result = await pool.query(
            `UPDATE trips SET status = 'Running', start_time = NOW() WHERE trip_id = $1 AND status = 'Planned'`,
            [tripId]
        );
        return result.rowCount > 0;
    },

    // End Trip
    async end(tripId) {
        const result = await pool.query(
            `UPDATE trips SET status = 'Completed', end_time = NOW() WHERE trip_id = $1 AND status = 'Running'`,
            [tripId]
        );
        return result.rowCount > 0;
    },

    // Cancel Trip
    async cancel(tripId) {
        const result = await pool.query(
            `UPDATE trips SET status = 'Cancelled' WHERE trip_id = $1 AND status = 'Planned'`,
            [tripId]
        );
        return result.rowCount > 0;
    },

    // Update Distance (from GPS)
    async updateDistance(tripId, addedDistance) {
        const result = await pool.query(
            `UPDATE trips SET distance_km = distance_km + $1 WHERE trip_id = $2`,
            [addedDistance, tripId]
        );
        return result.rowCount > 0;
    },

    // Update Trip Details (expanded with financial fields)
    async updateTripDetails(tripId, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        const allowedFields = [
            'distance_km', 'source', 'destination',
            'base_freight', 'toll_amount', 'toll_billable',
            'loading_cost', 'loading_billable',
            'unloading_cost', 'unloading_billable',
            'other_charges', 'other_billable',
            'gst_percentage', 'driver_bata',
            'empty_km', 'loaded_km'
        ];

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

        values.push(tripId);

        const result = await pool.query(
            `UPDATE trips SET ${fields.join(', ')} WHERE trip_id = $${paramIndex}`,
            values
        );

        return result.rowCount > 0;
    },

    // Get Trip Details (with all financial columns)
    async getById(tripId) {
        const result = await pool.query(
            `SELECT t.*, tr.truck_number, tr.capacity, d.name as driver_name, d.phone as driver_phone 
             FROM trips t
             JOIN trucks tr ON t.truck_id = tr.truck_id
             JOIN drivers d ON t.driver_id = d.driver_id
             WHERE t.trip_id = $1`,
            [tripId]
        );
        return result.rows[0] || null;
    },

    // Get All Trips with optional filtering
    async getAll(filters = {}) {
        let query = `
            SELECT t.*, tr.truck_number, d.name as driver_name 
            FROM trips t
            JOIN trucks tr ON t.truck_id = tr.truck_id
            JOIN drivers d ON t.driver_id = d.driver_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (filters.status) {
            query += ` AND t.status = $${paramIndex}`;
            params.push(filters.status);
            paramIndex++;
        }

        if (filters.driver_id) {
            query += ` AND t.driver_id = $${paramIndex}`;
            params.push(filters.driver_id);
            paramIndex++;
        }

        if (filters.truck_id) {
            query += ` AND t.truck_id = $${paramIndex}`;
            params.push(filters.truck_id);
            paramIndex++;
        }

        if (filters.dateFrom) {
            query += ` AND t.created_at >= $${paramIndex}`;
            params.push(filters.dateFrom);
            paramIndex++;
        }

        if (filters.dateTo) {
            query += ` AND t.created_at <= $${paramIndex}`;
            params.push(filters.dateTo);
            paramIndex++;
        }

        query += ` ORDER BY t.created_at DESC`;

        const result = await pool.query(query, params);
        return result.rows;
    },

    // Get trips by driver
    async getByDriver(driverId) {
        const result = await pool.query(
            `SELECT t.*, tr.truck_number, tr.capacity
             FROM trips t
             JOIN trucks tr ON t.truck_id = tr.truck_id
             WHERE t.driver_id = $1
             ORDER BY t.created_at DESC`,
            [driverId]
        );
        return result.rows;
    },

    // Get trips by truck
    async getByTruck(truckId) {
        const result = await pool.query(
            `SELECT t.*, d.name as driver_name, d.phone as driver_phone
             FROM trips t
             JOIN drivers d ON t.driver_id = d.driver_id
             WHERE t.truck_id = $1
             ORDER BY t.created_at DESC`,
            [truckId]
        );
        return result.rows;
    },

    // Get trips by status
    async getByStatus(status) {
        const result = await pool.query(
            `SELECT t.*, tr.truck_number, d.name as driver_name 
             FROM trips t
             JOIN trucks tr ON t.truck_id = tr.truck_id
             JOIN drivers d ON t.driver_id = d.driver_id
             WHERE t.status = $1
             ORDER BY t.created_at DESC`,
            [status]
        );
        return result.rows;
    },

    // Get trips by date range
    async getByDateRange(startDate, endDate) {
        const result = await pool.query(
            `SELECT t.*, tr.truck_number, d.name as driver_name 
             FROM trips t
             JOIN trucks tr ON t.truck_id = tr.truck_id
             JOIN drivers d ON t.driver_id = d.driver_id
             WHERE t.created_at BETWEEN $1 AND $2
             ORDER BY t.created_at DESC`,
            [startDate, endDate]
        );
        return result.rows;
    },

    // Get trip analytics (enhanced with financial data)
    async getTripAnalytics(filters = {}) {
        let query = `
            SELECT 
                COUNT(*) as total_trips,
                COUNT(CASE WHEN t.status = 'Completed' THEN 1 END) as completed_trips,
                COUNT(CASE WHEN t.status = 'Running' THEN 1 END) as running_trips,
                COUNT(CASE WHEN t.status = 'Planned' THEN 1 END) as planned_trips,
                COUNT(CASE WHEN t.status = 'Cancelled' THEN 1 END) as cancelled_trips,
                COALESCE(SUM(CASE WHEN t.status = 'Completed' THEN t.base_freight ELSE 0 END), 0) as total_base_revenue,
                COALESCE(SUM(CASE WHEN t.status = 'Completed' THEN t.distance_km ELSE 0 END), 0) as total_distance,
                COALESCE(AVG(CASE WHEN t.status = 'Completed' THEN t.base_freight END), 0) as average_base_freight,
                COALESCE(AVG(CASE WHEN t.status = 'Completed' THEN t.distance_km END), 0) as average_distance,
                COALESCE(AVG(
                    CASE WHEN t.status = 'Completed' AND (t.empty_km + t.loaded_km) > 0 
                    THEN (t.empty_km / (t.empty_km + t.loaded_km)) * 100 
                    END
                ), 0) as avg_dead_mileage_pct
            FROM trips t
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (filters.driver_id) {
            query += ` AND t.driver_id = $${paramIndex}`;
            params.push(filters.driver_id);
            paramIndex++;
        }

        if (filters.truck_id) {
            query += ` AND t.truck_id = $${paramIndex}`;
            params.push(filters.truck_id);
            paramIndex++;
        }

        if (filters.dateFrom) {
            query += ` AND t.created_at >= $${paramIndex}`;
            params.push(filters.dateFrom);
            paramIndex++;
        }

        if (filters.dateTo) {
            query += ` AND t.created_at <= $${paramIndex}`;
            params.push(filters.dateTo);
            paramIndex++;
        }

        const result = await pool.query(query, params);
        return result.rows[0];
    },

    // Get driver trip history with statistics
    async getDriverTripHistory(driverId) {
        const trips = await pool.query(
            `SELECT t.*, tr.truck_number, tr.capacity
             FROM trips t
             JOIN trucks tr ON t.truck_id = tr.truck_id
             WHERE t.driver_id = $1
             ORDER BY t.created_at DESC`,
            [driverId]
        );

        const stats = await pool.query(
            `SELECT 
                COUNT(*) as total_trips,
                COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_trips,
                COALESCE(SUM(CASE WHEN status = 'Completed' THEN distance_km ELSE 0 END), 0) as total_distance,
                COALESCE(SUM(CASE WHEN status = 'Completed' THEN base_freight ELSE 0 END), 0) as total_revenue
             FROM trips
             WHERE driver_id = $1`,
            [driverId]
        );

        return {
            trips: trips.rows,
            statistics: stats.rows[0]
        };
    }
};

module.exports = TripModel;
