-- RKS Transports Seed Data (Comprehensive)
-- Password for all users: password123
-- bcrypt hash: $2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W
-- This script resets dev data and inserts full sample records for every table/feature.

BEGIN;

TRUNCATE TABLE
    optimization_suggestions,
    trip_predictions,
    notifications,
    invoices,
    expenses,
    maintenance,
    alerts,
    fuel_logs,
    gps_logs,
    booking_requests,
    trips,
    drivers,
    trucks,
    customers,
    users
RESTART IDENTITY CASCADE;

-- ============ USERS ============
INSERT INTO users (user_id, email, password_hash, role, name, phone, created_at) VALUES
  (1,  'admin@example.com',         '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'admin',    'Admin User',           '9876543210', NOW() - INTERVAL '120 days'),
  (2,  'manager@example.com',       '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'manager',  'Manager User',         '9876543211', NOW() - INTERVAL '115 days'),
  (3,  'driver1@example.com',       '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'driver',   'Rajesh Kumar',         '9876543212', NOW() - INTERVAL '110 days'),
  (4,  'driver2@example.com',       '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'driver',   'Suresh Singh',         '9876543213', NOW() - INTERVAL '108 days'),
  (5,  'driver3@example.com',       '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'driver',   'Amit Patel',           '9876543214', NOW() - INTERVAL '106 days'),
  (6,  'test@example.com',          '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'customer', 'Test Customer',        '9876543215', NOW() - INTERVAL '104 days'),
  (7,  'logistics@acme.com',        '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'customer', 'Acme Logistics',       '9822200011', NOW() - INTERVAL '100 days'),
  (8,  'driver4@example.com',       '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'driver',   'Vikram Nair',          '9822200012', NOW() - INTERVAL '98 days'),
  (9,  'retail@freshmart.com',      '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'customer', 'FreshMart Retail',     '9822200013', NOW() - INTERVAL '95 days'),
  (10, 'ops.manager@example.com',   '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'manager',  'Ops Control Manager',  '9822200014', NOW() - INTERVAL '90 days'),
  (11, 'driver5@example.com',       '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'driver',   'Ravi Kumar',           '9822200015', NOW() - INTERVAL '88 days'),
  (12, 'enterprise@zenith.com',     '$2a$10$hTw2A0yLl6ajT0TLhKoOuOHa582WYAnxaSEpDCJZfu/q9xB0HLX/W', 'customer', 'Zenith Enterprise',    '9822200016', NOW() - INTERVAL '86 days');

-- ============ CUSTOMERS ============
INSERT INTO customers (customer_id, user_id, name, contact_number, email, created_at) VALUES
  (1, 6,  'Test Customer',       '9876543215', 'test@example.com',      NOW() - INTERVAL '104 days'),
  (2, NULL, 'Rakesh Sharma',     '9988776655', 'rakesh@example.com',    NOW() - INTERVAL '80 days'),
  (3, NULL, 'Priya Desai',       '9966554433', 'priya@example.com',     NOW() - INTERVAL '75 days'),
  (4, NULL, 'Vikram Reddy',      '9955443322', 'vikram@example.com',    NOW() - INTERVAL '70 days'),
  (5, NULL, 'Neha Gupta',        '9944332211', 'neha@example.com',      NOW() - INTERVAL '65 days'),
  (6, 7,  'Acme Logistics',      '9822200011', 'logistics@acme.com',    NOW() - INTERVAL '100 days'),
  (7, 9,  'FreshMart Retail',    '9822200013', 'retail@freshmart.com',  NOW() - INTERVAL '95 days'),
  (8, 12, 'Zenith Enterprise',   '9822200016', 'enterprise@zenith.com', NOW() - INTERVAL '86 days');

-- ============ TRUCKS ============
INSERT INTO trucks (truck_id, truck_number, capacity_tons, mileage_kmpl, status, created_at) VALUES
  (1, 'MH02AB1001', 15.00, 4.50, 'assigned',    NOW() - INTERVAL '120 days'),
  (2, 'MH02AB1002', 18.00, 4.20, 'available',   NOW() - INTERVAL '118 days'),
  (3, 'MH02AB1003', 12.00, 5.00, 'available',   NOW() - INTERVAL '116 days'),
  (4, 'MH02AB1004', 20.00, 4.00, 'assigned',    NOW() - INTERVAL '114 days'),
  (5, 'MH02AB1005', 16.00, 4.30, 'assigned',    NOW() - INTERVAL '112 days'),
  (6, 'MH02AB1006', 14.00, 4.60, 'maintenance', NOW() - INTERVAL '110 days'),
  (7, 'MH04CD2201', 22.00, 3.90, 'assigned',    NOW() - INTERVAL '108 days'),
  (8, 'KA05EF7788', 10.00, 5.40, 'available',   NOW() - INTERVAL '106 days');

-- ============ DRIVERS ============
INSERT INTO drivers (driver_id, name, phone, license_number, status, created_at) VALUES
  (1, 'Rajesh Kumar', '9876543212', 'MH1920100123456', 'assigned',  NOW() - INTERVAL '110 days'),
  (2, 'Suresh Singh', '9876543213', 'MH1920100123457', 'assigned',  NOW() - INTERVAL '108 days'),
  (3, 'Amit Patel',   '9876543214', 'MH1920100123458', 'assigned',  NOW() - INTERVAL '106 days'),
  (4, 'Vikram Nair',  '9822200012', 'MH1920100123459', 'assigned',  NOW() - INTERVAL '98 days'),
  (5, 'Ravi Kumar',   '9822200015', 'MH1920100123460', 'available', NOW() - INTERVAL '88 days'),
  (6, 'Manoj Das',    '9822200020', 'MH1920100123461', 'inactive',  NOW() - INTERVAL '84 days'),
  (7, 'Farhan Ali',   '9822200021', 'MH1920100123462', 'available', NOW() - INTERVAL '82 days');

-- ============ TRIPS ============
INSERT INTO trips (
    trip_id,
    truck_id,
    driver_id,
    source,
    destination,
    trip_distance,
    planned_start_time,
    planned_end_time,
    status,
    booking_request_id,
    created_at,
    updated_at
) VALUES
  (1, 4, 1, 'Mumbai Port',              'Delhi Warehouse',        1400.00, NOW() - INTERVAL '2 days',    NOW() + INTERVAL '2 days',   'in_progress', 3,  NOW() - INTERVAL '2 days',   NOW() - INTERVAL '12 minutes'),
  (2, 5, 2, 'Bangalore Industrial Area','Chennai Port',            350.00, NOW() + INTERVAL '4 hours',   NOW() + INTERVAL '26 hours', 'planned',     4,  NOW() - INTERVAL '14 hours', NOW() - INTERVAL '20 minutes'),
  (3, 1, 3, 'Pune Warehouse',           'Nashik Zone',             200.00, NOW() - INTERVAL '5 hours',   NOW() + INTERVAL '3 hours',  'in_progress', NULL, NOW() - INTERVAL '18 hours', NOW() - INTERVAL '6 minutes'),
  (4, 2, 5, 'Nagpur Port',              'Indore Warehouse',        900.00, NOW() - INTERVAL '32 days',   NOW() - INTERVAL '30 days',  'completed',   7,  NOW() - INTERVAL '34 days',  NOW() - INTERVAL '30 days'),
  (5, 3, 5, 'Kolkata Port',             'Lucknow Warehouse',      1100.00, NOW() - INTERVAL '72 days',   NOW() - INTERVAL '69 days',  'completed',   NULL, NOW() - INTERVAL '75 days', NOW() - INTERVAL '69 days'),
  (6, 8, 7, 'Jaipur ICD',               'Ahmedabad Hub',           700.00, NOW() - INTERVAL '3 days',    NOW() - INTERVAL '2 days',   'cancelled',   9,  NOW() - INTERVAL '4 days',   NOW() - INTERVAL '2 days'),
  (7, 7, 4, 'Surat Hazira Port',        'Bhopal Inland Depot',     650.00, NOW() + INTERVAL '28 hours', NOW() + INTERVAL '58 hours', 'planned',     8,  NOW() - INTERVAL '8 hours',  NOW() - INTERVAL '15 minutes'),
  (8, 2, 1, 'Chennai Central Yard',     'Coimbatore Market',       500.00, NOW() - INTERVAL '160 days',  NOW() - INTERVAL '159 days', 'completed',   NULL, NOW() - INTERVAL '160 days', NOW() - INTERVAL '159 days');

-- ============ BOOKING REQUESTS ============
INSERT INTO booking_requests (
    id,
    customer_id,
    pickup_location,
    destination,
    load_type,
    weight,
    pickup_date,
    delivery_deadline,
    contact_number,
    offered_price,
    status,
    pickup_latitude,
    pickup_longitude,
    destination_latitude,
    destination_longitude,
    approved_trip_id,
    created_at,
    updated_at
) VALUES
  (1, 2, 'Mumbai Port Terminal',        'Delhi Distribution Center',   'Containerized Cargo', 18000.00, CURRENT_DATE + INTERVAL '2 days',  CURRENT_DATE + INTERVAL '7 days',  '9988776655', 48000.00, 'pending',  19.0730, 72.8820, 28.7041, 77.1025, NULL, NOW() - INTERVAL '10 hours', NOW() - INTERVAL '10 hours'),
  (2, 3, 'Bangalore Tech Park',         'Hyderabad Industrial Zone',   'General Cargo',       12000.00, CURRENT_DATE + INTERVAL '3 days',  CURRENT_DATE + INTERVAL '5 days',  '9966554433', 16000.00, 'pending',  13.1939, 77.5941, 17.3850, 78.4867, NULL, NOW() - INTERVAL '9 hours',  NOW() - INTERVAL '9 hours'),
  (3, 4, 'Pune Warehouse Complex',      'Nashik EZ',                   'Dry Goods',            8000.00, CURRENT_DATE - INTERVAL '1 day',  CURRENT_DATE + INTERVAL '1 day',  '9955443322',  9500.00, 'approved', 18.5204, 73.8567, 19.9975, 73.7898, 1,    NOW() - INTERVAL '3 days',  NOW() - INTERVAL '2 days'),
  (4, 5, 'Bangalore Industrial Area',   'Chennai Port',                'Machinery Parts',     14000.00, CURRENT_DATE + INTERVAL '1 day',  CURRENT_DATE + INTERVAL '2 days', '9944332211', 22000.00, 'approved', 13.0827, 80.2707, 12.9716, 77.5946, 2,    NOW() - INTERVAL '20 hours', NOW() - INTERVAL '16 hours'),
  (5, 6, 'Surat Textile Hub',           'Jaipur Goods Terminal',       'Textile Bales',       10000.00, CURRENT_DATE + INTERVAL '4 days',  CURRENT_DATE + INTERVAL '6 days',  '9822200011', 17500.00, 'pending',  21.1702, 72.8311, 26.9124, 75.7873, NULL, NOW() - INTERVAL '6 hours',  NOW() - INTERVAL '6 hours'),
  (6, 7, 'Ahmedabad Industrial Estate', 'Vadodara Retail Cluster',     'Packaged Goods',       5000.00, CURRENT_DATE + INTERVAL '2 days',  CURRENT_DATE + INTERVAL '3 days',  '9822200013',  8500.00, 'rejected', 23.0225, 72.5714, 22.3072, 73.1812, NULL, NOW() - INTERVAL '5 days',   NOW() - INTERVAL '4 days'),
  (7, 8, 'Nagpur Port',                 'Indore Industrial Area',      'Heavy Equipment',     20000.00, CURRENT_DATE - INTERVAL '35 days', CURRENT_DATE - INTERVAL '30 days', '9822200016', 36000.00, 'approved', 21.1458, 79.0882, 22.7196, 75.8577, 4,    NOW() - INTERVAL '36 days', NOW() - INTERVAL '34 days'),
  (8, 6, 'Surat Hazira Port',           'Bhopal Inland Depot',         'Chemical Drums',      15000.00, CURRENT_DATE + INTERVAL '2 days',  CURRENT_DATE + INTERVAL '4 days',  '9822200011', 28500.00, 'approved', 21.1140, 72.6410, 23.2599, 77.4126, 7,    NOW() - INTERVAL '12 hours', NOW() - INTERVAL '8 hours'),
  (9, 7, 'Jaipur ICD',                  'Ahmedabad Hub',               'Consumer Electronics',  9000.00, CURRENT_DATE - INTERVAL '4 days',  CURRENT_DATE - INTERVAL '2 days',  '9822200013', 14000.00, 'rejected', 26.9124, 75.7873, 23.0225, 72.5714, NULL, NOW() - INTERVAL '5 days',  NOW() - INTERVAL '2 days'),
  (10, 1,'Pune Auto Cluster',           'Mumbai Retail Hub',           'Auto Components',      7000.00, CURRENT_DATE + INTERVAL '1 day',  CURRENT_DATE + INTERVAL '2 days',  '9876543215', 12000.00, 'pending',  18.5204, 73.8567, 19.0760, 72.8777, NULL, NOW() - INTERVAL '3 hours',  NOW() - INTERVAL '3 hours');

-- ============ GPS LOGS ============
INSERT INTO gps_logs (gps_id, truck_id, trip_id, latitude, longitude, speed, timestamp) VALUES
  (1, 4, 1, 19.0730, 72.8820, 58.00, NOW() - INTERVAL '50 minutes'),
  (2, 4, 1, 19.1400, 72.9400, 62.00, NOW() - INTERVAL '40 minutes'),
  (3, 4, 1, 19.2100, 73.0100, 69.00, NOW() - INTERVAL '30 minutes'),
  (4, 4, 1, 19.2900, 73.1100, 74.00, NOW() - INTERVAL '20 minutes'),
  (5, 4, 1, 19.3600, 73.2200, 67.00, NOW() - INTERVAL '10 minutes'),
  (6, 4, 1, 19.4300, 73.3100, 64.00, NOW() - INTERVAL '4 minutes'),
  (7, 1, 3, 18.5204, 73.8567, 40.00, NOW() - INTERVAL '45 minutes'),
  (8, 1, 3, 18.5900, 73.9000, 42.00, NOW() - INTERVAL '35 minutes'),
  (9, 1, 3, 18.6600, 73.9400, 46.00, NOW() - INTERVAL '25 minutes'),
  (10, 1, 3, 18.7300, 73.9900, 52.00, NOW() - INTERVAL '15 minutes'),
  (11, 1, 3, 18.8100, 74.0400, 48.00, NOW() - INTERVAL '8 minutes'),
  (12, 1, 3, 18.8700, 74.0800, 45.00, NOW() - INTERVAL '3 minutes'),
  (13, 2, 4, 21.1458, 79.0882, 55.00, NOW() - INTERVAL '31 days'),
  (14, 2, 4, 22.0100, 78.3000, 57.00, NOW() - INTERVAL '30 days 12 hours'),
  (15, 2, 4, 22.7196, 75.8577, 50.00, NOW() - INTERVAL '30 days'),
  (16, 3, 5, 22.5726, 88.3639, 53.00, NOW() - INTERVAL '71 days'),
  (17, 3, 5, 24.2000, 85.1000, 60.00, NOW() - INTERVAL '70 days'),
  (18, 3, 5, 26.8467, 80.9462, 52.00, NOW() - INTERVAL '69 days'),
  (19, 7, 7, 21.1140, 72.6410, 0.00,  NOW() - INTERVAL '30 minutes'),
  (20, 5, 2, 12.9716, 77.5946, 0.00,  NOW() - INTERVAL '20 minutes');

-- ============ FUEL LOGS ============
INSERT INTO fuel_logs (
    fuel_id,
    trip_id,
    truck_id,
    distance_km,
    mileage_kmpl,
    actual_fuel,
    liters,
    fuel_filled,
    timestamp,
    created_at
) VALUES
  (1, 1, 4, 320.00, 4.50, 72.00, 72.00, 72.00, NOW() - INTERVAL '2 days',      NOW() - INTERVAL '2 days'),
  (2, 1, 4, 640.00, 4.10, 160.00,160.00,160.00, NOW() - INTERVAL '1 day',       NOW() - INTERVAL '1 day'),
  (3, 2, 5, 120.00, 4.30, 28.00, 28.00, 28.00, NOW() - INTERVAL '16 hours',     NOW() - INTERVAL '16 hours'),
  (4, 3, 1, 80.00,  5.00, 18.00, 18.00, 18.00, NOW() - INTERVAL '6 hours',      NOW() - INTERVAL '6 hours'),
  (5, 3, 1, 160.00, 4.80, 38.00, 38.00, 38.00, NOW() - INTERVAL '3 hours',      NOW() - INTERVAL '3 hours'),
  (6, 4, 2, 900.00, 4.00, 230.00,230.00,230.00, NOW() - INTERVAL '31 days',     NOW() - INTERVAL '31 days'),
  (7, 5, 3, 1100.00,5.00, 220.00,220.00,220.00, NOW() - INTERVAL '70 days',     NOW() - INTERVAL '70 days'),
  (8, 6, 8, 300.00, 5.40, 56.00, 56.00, 56.00, NOW() - INTERVAL '3 days',       NOW() - INTERVAL '3 days'),
  (9, 7, 7, 100.00, 3.90, 30.00, 30.00, 30.00, NOW() - INTERVAL '9 hours',      NOW() - INTERVAL '9 hours'),
  (10,8, 2, 500.00, 4.20, 118.00,118.00,118.00, NOW() - INTERVAL '159 days',    NOW() - INTERVAL '159 days');

-- ============ ALERTS ============
INSERT INTO alerts (id, truck_id, trip_id, alert_type, description, created_at) VALUES
  (1, 4, 1, 'overspeed',       'Truck MH02AB1004 crossed 82 km/h near Nashik bypass.',      NOW() - INTERVAL '25 minutes'),
  (2, 4, 1, 'overspeed',       'Truck MH02AB1004 crossed 86 km/h on NH-48 corridor.',        NOW() - INTERVAL '12 minutes'),
  (3, 1, 3, 'idle_vehicle',    'Truck MH02AB1001 was idle for 32 minutes near Sangamner.',   NOW() - INTERVAL '40 minutes'),
  (4, 7, 7, 'no_progress_24h', 'Trip #7 has no route progress in the last 24 hours.',         NOW() - INTERVAL '2 hours'),
  (5, 5, 2, 'idle_vehicle',    'Truck MH02AB1005 waiting at loading gate for 35 minutes.',    NOW() - INTERVAL '55 minutes'),
  (6, 8, 6, 'fuel_anomaly',    'Trip #6 consumed fuel 22% above baseline expectation.',       NOW() - INTERVAL '4 hours'),
  (7, 2, 4, 'overspeed',       'Truck MH02AB1002 overspeed event recorded during trip #4.',   NOW() - INTERVAL '30 days'),
  (8, 3, 5, 'no_progress_24h', 'Trip #5 historical data indicates 24h no-progress segment.',  NOW() - INTERVAL '68 days');

-- ============ MAINTENANCE ============
INSERT INTO maintenance (maintenance_id, truck_id, service_date, description, cost, created_at) VALUES
  (1, 6, CURRENT_DATE - INTERVAL '12 days', 'Engine oil and filter replacement',           4500.00, NOW() - INTERVAL '12 days'),
  (2, 6, CURRENT_DATE - INTERVAL '10 days', 'Brake pad replacement and brake fluid top-up',8200.00, NOW() - INTERVAL '10 days'),
  (3, 1, CURRENT_DATE - INTERVAL '25 days', 'Tyre alignment and balancing',                3800.00, NOW() - INTERVAL '25 days'),
  (4, 4, CURRENT_DATE - INTERVAL '40 days', 'AC compressor and belt service',              6500.00, NOW() - INTERVAL '40 days'),
  (5, 7, CURRENT_DATE - INTERVAL '20 days', 'Suspension inspection and minor repair',      5200.00, NOW() - INTERVAL '20 days'),
  (6, 2, CURRENT_DATE - INTERVAL '60 days', 'Electrical wiring harness maintenance',        7100.00, NOW() - INTERVAL '60 days');

-- ============ EXPENSES ============
INSERT INTO expenses (expense_id, trip_id, truck_id, category, amount, description, created_at) VALUES
  ('11111111-1111-1111-1111-000000000001', 1, 4, 'Fuel',        28000.00, 'Diesel refill for Mumbai-Delhi corridor segment.',            NOW() - INTERVAL '1 day'),
  ('11111111-1111-1111-1111-000000000002', 1, 4, 'Toll',         5600.00, 'National highway toll transactions for trip #1.',             NOW() - INTERVAL '20 hours'),
  ('11111111-1111-1111-1111-000000000003', 2, 5, 'Driver',       3000.00, 'Driver allowance and overnight duty charges.',               NOW() - INTERVAL '14 hours'),
  ('11111111-1111-1111-1111-000000000004', 3, 1, 'Fuel',         8500.00, 'Fuel consumption for Pune to Nashik run.',                    NOW() - INTERVAL '5 hours'),
  ('11111111-1111-1111-1111-000000000005', 4, 2, 'RTO',          2200.00, 'State permit and route permit processing charges.',          NOW() - INTERVAL '31 days'),
  ('11111111-1111-1111-1111-000000000006', 4, 2, 'Insurance',    9800.00, 'Transit insurance allocation against trip #4.',              NOW() - INTERVAL '31 days'),
  ('11111111-1111-1111-1111-000000000007', 5, 3, 'Fuel',        22000.00, 'Long-haul diesel expense for eastern route.',                NOW() - INTERVAL '70 days'),
  ('11111111-1111-1111-1111-000000000008', 5, 3, 'Toll',         3200.00, 'Interstate toll charges for trip #5.',                       NOW() - INTERVAL '69 days'),
  ('11111111-1111-1111-1111-000000000009', 6, 8, 'Misc',         1500.00, 'Cancellation-related parking and admin fees.',               NOW() - INTERVAL '3 days'),
  ('11111111-1111-1111-1111-000000000010', 7, 7, 'Maintenance',  4200.00, 'Preventive service allocation before dispatch.',             NOW() - INTERVAL '8 hours'),
  ('11111111-1111-1111-1111-000000000011', 8, 2, 'Driver',       2600.00, 'Historical driver bata allocation for completed trip.',       NOW() - INTERVAL '159 days'),
  ('11111111-1111-1111-1111-000000000012', 8, 2, 'Fuel',        12000.00, 'Historical diesel spend for Chennai-Coimbatore trip.',      NOW() - INTERVAL '159 days');

-- ============ INVOICES ============
INSERT INTO invoices (
    invoice_id,
    trip_id,
    invoice_number,
    invoice_date,
    due_date,
    subtotal,
    gst_amount,
    total_amount,
    payment_status,
    amount_paid,
    created_at
) VALUES
  ('22222222-2222-2222-2222-000000000001', 4, 'INV-2026-0001', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '5 days', 42000.00, 7560.00, 49560.00, 'Paid',    49560.00, NOW() - INTERVAL '30 days'),
  ('22222222-2222-2222-2222-000000000002', 5, 'INV-2026-0002', CURRENT_DATE - INTERVAL '69 days', CURRENT_DATE - INTERVAL '39 days',55000.00, 9900.00, 64900.00, 'Partial', 30000.00, NOW() - INTERVAL '69 days'),
  ('22222222-2222-2222-2222-000000000003', 1, 'INV-2026-0003', CURRENT_DATE,                       CURRENT_DATE + INTERVAL '30 days',85000.00,15300.00,100300.00,'Pending',     0.00, NOW()),
  ('22222222-2222-2222-2222-000000000004', 2, 'INV-2026-0004', CURRENT_DATE,                       CURRENT_DATE + INTERVAL '30 days',30000.00, 5400.00, 35400.00,'Pending',     0.00, NOW()),
  ('22222222-2222-2222-2222-000000000005', 7, 'INV-2026-0005', CURRENT_DATE + INTERVAL '1 day',   CURRENT_DATE + INTERVAL '31 days',46000.00, 8280.00, 54280.00,'Pending',     0.00, NOW() - INTERVAL '7 hours'),
  ('22222222-2222-2222-2222-000000000006', 8, 'INV-2025-0099', CURRENT_DATE - INTERVAL '159 days',CURRENT_DATE - INTERVAL '129 days',25000.00, 4500.00, 29500.00,'Paid',    29500.00, NOW() - INTERVAL '159 days');

-- ============ NOTIFICATIONS ============
INSERT INTO notifications (notification_id, user_id, message, type, is_read, related_trip_id, created_at) VALUES
  (1,  1,  'New pending booking request #1 from Mumbai Port Terminal.',               'booking', false, 1, NOW() - INTERVAL '55 minutes'),
  (2,  1,  'Trip #1 Mumbai-Delhi is currently in progress.',                           'trip',    false, 1, NOW() - INTERVAL '35 minutes'),
  (3,  1,  'Operational alert generated for Truck MH02AB1004 (overspeed).',           'alert',   false, 1, NOW() - INTERVAL '12 minutes'),
  (4,  1,  'Invoice INV-2026-0001 has been fully settled.',                           'invoice', true,  4, NOW() - INTERVAL '28 days'),
  (5,  2,  'Booking #8 approved and trip #7 has been scheduled.',                      'booking', false, 7, NOW() - INTERVAL '8 hours'),
  (6,  2,  'Maintenance cost update posted for Truck MH02AB1006.',                    'maintenance', true, 6, NOW() - INTERVAL '10 days'),
  (7,  3,  'You have been assigned to Trip #1 (Mumbai Port to Delhi Warehouse).',     'trip',    false, 1, NOW() - INTERVAL '2 days'),
  (8,  4,  'You have been assigned to upcoming Trip #2 (Bangalore to Chennai).',      'trip',    false, 2, NOW() - INTERVAL '14 hours'),
  (9,  5,  'Trip #4 completion summary and payout statement is available.',            'trip',    true,  4, NOW() - INTERVAL '29 days'),
  (10, 6,  'Your booking request #10 is under review by operations.',                  'booking', false, 2, NOW() - INTERVAL '3 hours'),
  (11, 7,  'Your pending booking request #5 has been shortlisted for assignment.',     'booking', false, 7, NOW() - INTERVAL '6 hours'),
  (12, 10, 'Fleet utilization report refreshed with latest analytics snapshots.',      'analytics', true, 3, NOW() - INTERVAL '1 hour');

-- ============ TRIP PREDICTIONS (ANALYTICS) ============
INSERT INTO trip_predictions (
    prediction_id,
    trip_id,
    truck_id,
    distance_remaining,
    current_speed,
    historical_speed,
    trip_distance,
    eta_minutes,
    delay_probability,
    created_at
) VALUES
  (1, 1, 4, 980.250, 64.00, 61.20, 1400.00, 915.00, 0.2840, NOW() - INTERVAL '50 minutes'),
  (2, 1, 4, 910.700, 67.50, 62.30, 1400.00, 845.00, 0.3010, NOW() - INTERVAL '35 minutes'),
  (3, 1, 4, 860.400, 65.80, 63.10, 1400.00, 810.00, 0.3260, NOW() - INTERVAL '18 minutes'),
  (4, 3, 1, 145.300, 48.00, 45.40,  200.00, 185.00, 0.1740, NOW() - INTERVAL '28 minutes'),
  (5, 3, 1, 118.900, 46.20, 44.80,  200.00, 149.00, 0.1920, NOW() - INTERVAL '15 minutes'),
  (6, 3, 1,  90.200, 45.00, 45.00,  200.00, 122.00, 0.2210, NOW() - INTERVAL '6 minutes');

-- ============ OPTIMIZATION SUGGESTIONS ============
INSERT INTO optimization_suggestions (
    suggestion_id,
    truck_id,
    booking_id,
    distance_to_pickup_km,
    score,
    status,
    created_at,
    updated_at
) VALUES
  (1, 4, 1, 12.40, 53.6000, 'open',     NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '40 minutes'),
  (2, 1, 2,  9.80, 57.9000, 'open',     NOW() - INTERVAL '35 minutes', NOW() - INTERVAL '20 minutes'),
  (3, 7, 5, 18.20, 49.3000, 'open',     NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '10 minutes'),
  (4, 8,10, 22.10, 41.2000, 'open',     NOW() - INTERVAL '25 minutes', NOW() - INTERVAL '8 minutes'),
  (5, 5, 1, 27.40, 36.7000, 'reviewed', NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '7 minutes'),
  (6, 2, 2, 14.30, 44.9000, 'reviewed', NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '6 minutes'),
  (7, 3, 5, 31.00, 29.6000, 'open',     NOW() - INTERVAL '12 minutes', NOW() - INTERVAL '4 minutes'),
  (8, 4,10, 16.75, 38.1000, 'accepted', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '2 minutes');

-- ============ RESET SERIAL SEQUENCES ============
SELECT setval('users_user_id_seq', COALESCE((SELECT MAX(user_id) FROM users), 1), true);
SELECT setval('customers_customer_id_seq', COALESCE((SELECT MAX(customer_id) FROM customers), 1), true);
SELECT setval('notifications_notification_id_seq', COALESCE((SELECT MAX(notification_id) FROM notifications), 1), true);
SELECT setval('trucks_truck_id_seq', COALESCE((SELECT MAX(truck_id) FROM trucks), 1), true);
SELECT setval('drivers_driver_id_seq', COALESCE((SELECT MAX(driver_id) FROM drivers), 1), true);
SELECT setval('maintenance_maintenance_id_seq', COALESCE((SELECT MAX(maintenance_id) FROM maintenance), 1), true);
SELECT setval('trips_trip_id_seq', COALESCE((SELECT MAX(trip_id) FROM trips), 1), true);
SELECT setval('gps_logs_gps_id_seq', COALESCE((SELECT MAX(gps_id) FROM gps_logs), 1), true);
SELECT setval('alerts_id_seq', COALESCE((SELECT MAX(id) FROM alerts), 1), true);
SELECT setval('fuel_logs_fuel_id_seq', COALESCE((SELECT MAX(fuel_id) FROM fuel_logs), 1), true);
SELECT setval('booking_requests_id_seq', COALESCE((SELECT MAX(id) FROM booking_requests), 1), true);
SELECT setval('trip_predictions_prediction_id_seq', COALESCE((SELECT MAX(prediction_id) FROM trip_predictions), 1), true);
SELECT setval('optimization_suggestions_suggestion_id_seq', COALESCE((SELECT MAX(suggestion_id) FROM optimization_suggestions), 1), true);

COMMIT;
