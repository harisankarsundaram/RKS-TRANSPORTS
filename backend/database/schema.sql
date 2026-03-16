-- Canonical PostgreSQL schema for RKS-Transports
-- This script is aligned with backend initDb + active service usage.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK(role IN ('admin', 'driver', 'manager')),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trucks (
    truck_id SERIAL PRIMARY KEY,
    truck_number VARCHAR(50) UNIQUE NOT NULL,
    capacity NUMERIC(10,2) NOT NULL,
    mileage_kmpl NUMERIC(10,2) DEFAULT 4.50,
    status VARCHAR(20) DEFAULT 'Available' CHECK(status IN ('Available', 'Assigned', 'Maintenance')),
    insurance_expiry DATE NOT NULL,
    fitness_expiry DATE NOT NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drivers (
    driver_id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NULL REFERENCES users(user_id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    license_expiry DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'Available' CHECK(status IN ('Available', 'Assigned')),
    assigned_truck_id INTEGER NULL REFERENCES trucks(truck_id) ON DELETE SET NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trips (
    trip_id SERIAL PRIMARY KEY,
    truck_id INTEGER NOT NULL REFERENCES trucks(truck_id),
    driver_id INTEGER NOT NULL REFERENCES drivers(driver_id),
    lr_number VARCHAR(50) UNIQUE NOT NULL,
    source VARCHAR(120) NOT NULL,
    destination VARCHAR(120) NOT NULL,
    route_polyline TEXT,
    distance_km NUMERIC(10,2) DEFAULT 0,
    gps_distance_km NUMERIC(12,2) DEFAULT 0,
    base_freight NUMERIC(12,2) DEFAULT 0,
    toll_amount NUMERIC(12,2) DEFAULT 0,
    loading_cost NUMERIC(12,2) DEFAULT 0,
    unloading_cost NUMERIC(12,2) DEFAULT 0,
    fast_tag NUMERIC(12,2) DEFAULT 0,
    gst_percentage NUMERIC(5,2) DEFAULT 0,
    driver_bata NUMERIC(12,2) DEFAULT 0,
    empty_km NUMERIC(10,2) DEFAULT 0,
    loaded_km NUMERIC(10,2) DEFAULT 0,
    start_time TIMESTAMP,
    planned_arrival_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Planned' CHECK(status IN ('Planned', 'Running', 'Completed', 'Cancelled')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_routes (
    trip_id INTEGER PRIMARY KEY REFERENCES trips(trip_id) ON DELETE CASCADE,
    route_polyline TEXT NOT NULL,
    distance NUMERIC(10,2) NOT NULL,
    estimated_time NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gps_logs (
    gps_id SERIAL PRIMARY KEY,
    truck_id INTEGER REFERENCES trucks(truck_id),
    trip_id INTEGER REFERENCES trips(trip_id) ON DELETE CASCADE,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    speed_kmph NUMERIC(10,2) DEFAULT 0,
    ignition BOOLEAN DEFAULT TRUE,
    recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fuel_logs (
    fuel_id SERIAL PRIMARY KEY,
    truck_id INTEGER REFERENCES trucks(truck_id),
    trip_id INTEGER REFERENCES trips(trip_id) ON DELETE CASCADE,
    liters NUMERIC(10,2),
    fuel_filled NUMERIC(10,2),
    odometer_reading NUMERIC(12,2),
    price_per_liter NUMERIC(10,2),
    total_cost NUMERIC(12,2),
    timestamp TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_requests (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(120) NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    pickup_location VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    load_type VARCHAR(120) NOT NULL,
    weight NUMERIC(10,2) NOT NULL,
    pickup_date DATE NOT NULL,
    delivery_deadline DATE NOT NULL,
    offered_price NUMERIC(12,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    pickup_latitude NUMERIC(10,7),
    pickup_longitude NUMERIC(10,7),
    destination_latitude NUMERIC(10,7),
    destination_longitude NUMERIC(10,7),
    approved_trip_id INTEGER REFERENCES trips(trip_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    truck_id INTEGER REFERENCES trucks(truck_id),
    trip_id INTEGER REFERENCES trips(trip_id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance (
    maintenance_id SERIAL PRIMARY KEY,
    truck_id INTEGER REFERENCES trucks(truck_id),
    service_date DATE NOT NULL,
    description TEXT,
    cost NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id INTEGER REFERENCES trips(trip_id) ON DELETE CASCADE,
    truck_id INTEGER REFERENCES trucks(truck_id),
    category VARCHAR(50) NOT NULL CHECK(category IN ('Fuel', 'Toll', 'Maintenance', 'Driver', 'RTO', 'Insurance', 'Misc')),
    amount NUMERIC(12,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id INTEGER REFERENCES trips(trip_id),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    gst_amount NUMERIC(12,2) NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'Pending' CHECK(payment_status IN ('Pending', 'Partial', 'Paid')),
    amount_paid NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_trip_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional table used by the alternative/phase analytics worker service.
CREATE TABLE IF NOT EXISTS trip_predictions (
    prediction_id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL,
    truck_id INTEGER NOT NULL,
    distance_remaining NUMERIC(10,3) NOT NULL,
    current_speed NUMERIC(10,2) NOT NULL,
    historical_speed NUMERIC(10,2) NOT NULL,
    trip_distance NUMERIC(10,2) NOT NULL,
    eta_minutes NUMERIC(10,2) NOT NULL,
    delay_probability NUMERIC(5,4) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_trucks_status ON trucks(status);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_trips_truck_id ON trips(truck_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trip_routes_distance ON trip_routes(distance);
CREATE INDEX IF NOT EXISTS idx_gps_logs_trip_id ON gps_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_gps_logs_recorded_at ON gps_logs(recorded_at);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_trip_id ON fuel_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_truck_id ON fuel_logs(truck_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_timestamp ON fuel_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_booking_requests_pickup_date ON booking_requests(pickup_date);
CREATE INDEX IF NOT EXISTS idx_alerts_trip_id ON alerts(trip_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_expenses_truck_id ON expenses(truck_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_invoices_trip_id ON invoices(trip_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_trip_predictions_trip_time ON trip_predictions(trip_id, created_at DESC);
