-- RKS-Transports Canonical Schema
-- Aligned with all microservice ensureSchema() calls

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========== AUTH SERVICE ==========
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK(role IN ('admin', 'manager', 'driver', 'customer')),
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
    customer_id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(user_id) ON DELETE SET NULL,
    name VARCHAR(120),
    contact_number VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
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

-- ========== FLEET SERVICE ==========
CREATE TABLE IF NOT EXISTS trucks (
    truck_id SERIAL PRIMARY KEY,
    truck_number VARCHAR(50) UNIQUE NOT NULL,
    capacity_tons NUMERIC(10,2) NOT NULL,
    mileage_kmpl NUMERIC(10,2) NOT NULL DEFAULT 4.5,
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'assigned', 'maintenance')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drivers (
    driver_id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    license_number VARCHAR(80) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'assigned', 'inactive')),
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

-- ========== TRIP SERVICE ==========
CREATE TABLE IF NOT EXISTS trips (
    trip_id SERIAL PRIMARY KEY,
    truck_id INTEGER NOT NULL,
    driver_id INTEGER NOT NULL,
    source VARCHAR(140) NOT NULL,
    destination VARCHAR(140) NOT NULL,
    trip_distance NUMERIC(10,2) NOT NULL DEFAULT 0,
    planned_start_time TIMESTAMP,
    planned_end_time TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    booking_request_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
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

-- ========== TRACKING SERVICE ==========
CREATE TABLE IF NOT EXISTS gps_logs (
    gps_id SERIAL PRIMARY KEY,
    truck_id INTEGER NOT NULL,
    trip_id INTEGER NOT NULL,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    speed NUMERIC(10,2) NOT NULL DEFAULT 0,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- ========== ALERT SERVICE ==========
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    truck_id INTEGER,
    trip_id INTEGER,
    alert_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fuel_logs (
    fuel_id SERIAL PRIMARY KEY,
    trip_id INTEGER,
    truck_id INTEGER,
    distance_km NUMERIC(10,2),
    mileage_kmpl NUMERIC(10,2),
    actual_fuel NUMERIC(10,2),
    liters NUMERIC(10,2),
    fuel_filled NUMERIC(10,2),
    timestamp TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========== BOOKING SERVICE ==========
CREATE TABLE IF NOT EXISTS booking_requests (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    pickup_location VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    load_type VARCHAR(120) NOT NULL,
    weight NUMERIC(10,2) NOT NULL,
    pickup_date DATE NOT NULL,
    delivery_deadline DATE NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    offered_price NUMERIC(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    pickup_latitude NUMERIC(10,7),
    pickup_longitude NUMERIC(10,7),
    destination_latitude NUMERIC(10,7),
    destination_longitude NUMERIC(10,7),
    approved_trip_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ========== ANALYTICS SERVICE ==========
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

-- ========== OPTIMIZATION SERVICE ==========
CREATE TABLE IF NOT EXISTS optimization_suggestions (
    suggestion_id SERIAL PRIMARY KEY,
    truck_id INTEGER NOT NULL,
    booking_id INTEGER NOT NULL,
    distance_to_pickup_km NUMERIC(10,2) NOT NULL,
    score NUMERIC(10,4) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ========== INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_trucks_status ON trucks(status);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_gps_logs_trip_time ON gps_logs(trip_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gps_logs_truck_time ON gps_logs(truck_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_trip_id ON fuel_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_truck_id ON fuel_logs(truck_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_trip ON alerts(trip_id);
CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_expenses_truck_id ON expenses(truck_id);
CREATE INDEX IF NOT EXISTS idx_invoices_trip_id ON invoices(trip_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_predictions_trip_time ON trip_predictions(trip_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_optimization_unique_open ON optimization_suggestions(truck_id, booking_id, status);
