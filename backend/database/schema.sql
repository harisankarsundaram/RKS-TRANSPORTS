-- Truck and Driver Management System Database Schema

-- Create database
CREATE DATABASE IF NOT EXISTS truck_driver_db;
USE truck_driver_db;

-- Trucks table
CREATE TABLE IF NOT EXISTS trucks (
    truck_id INT PRIMARY KEY AUTO_INCREMENT,
    truck_number VARCHAR(50) UNIQUE NOT NULL,
    capacity FLOAT NOT NULL,
    status ENUM('Available', 'Assigned', 'Maintenance') DEFAULT 'Available',
    insurance_expiry DATE NOT NULL,
    fitness_expiry DATE NOT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Drivers table
CREATE TABLE IF NOT EXISTS drivers (
    driver_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    license_expiry DATE NOT NULL,
    status ENUM('Available', 'Assigned') DEFAULT 'Available',
    assigned_truck_id INT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_truck_id) REFERENCES trucks(truck_id) ON DELETE SET NULL
);

-- Index for faster lookups
CREATE INDEX idx_trucks_status ON trucks(status);
CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_drivers_assigned_truck ON drivers(assigned_truck_id);
