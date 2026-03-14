-- PostgreSQL schema for Intelligent Logistics & Fleet Optimization Platform

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK(role IN ('admin', 'driver', 'manager', 'customer')),
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

CREATE INDEX IF NOT EXISTS idx_trucks_status ON trucks(status);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trip_routes_distance ON trip_routes(distance);
CREATE INDEX IF NOT EXISTS idx_gps_logs_trip_id ON gps_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_gps_logs_recorded_at ON gps_logs(recorded_at);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_trip_id ON fuel_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_alerts_trip_id ON alerts(trip_id);
