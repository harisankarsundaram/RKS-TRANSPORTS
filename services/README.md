# Core Microservice Architecture

Paste this first.

You are restructuring an existing logistics platform into a microservice architecture.

The current system contains:

- React frontend
- Node.js backend
- PostgreSQL database
- basic fleet and trip management

Your task is to convert this system into independent microservices while preserving functionality.

The system must use:

- Node.js
- Express
- React
- PostgreSQL

Create the following microservices:

- api-gateway
- auth-service
- fleet-service
- trip-service
- booking-service

Each service must be implemented independently.

## Service Responsibilities

### auth-service

Handles authentication and authorization.

Endpoints:

- POST /auth/register
- POST /auth/login
- GET /auth/me

### fleet-service

Manages trucks and drivers.

Endpoints:

- POST /trucks
- GET /trucks
- POST /drivers
- GET /drivers

Truck fields:

- truck_number
- capacity_tons
- mileage_kmpl
- status

Driver fields:

- name
- phone
- license_number
- status

### trip-service

Handles logistics trips.

Endpoints:

- POST /trips
- GET /trips
- GET /trips/:id
- PUT /trips/:id/status

Trip fields:

- truck_id
- driver_id
- source
- destination
- trip_distance
- planned_start_time
- planned_end_time
- status

### booking-service

Handles customer truck booking.

Endpoints:

- POST /booking/request
- GET /booking/requests
- POST /booking/approve/:id

Booking fields:

- pickup_location
- destination
- load_type
- weight
- pickup_date
- delivery_deadline
- contact_number
- offered_price
- status

### api-gateway

Routes requests to services.

Example routing:

- /api/auth -> auth-service
- /api/fleet -> fleet-service
- /api/trips -> trip-service
- /api/bookings -> booking-service

## Database

Use PostgreSQL.

Create tables:

- users
- customers
- drivers
- trucks
- booking_requests
- trips

## Repository Structure

logistics-platform

- frontend
- services
	- api-gateway
	- auth-service
	- fleet-service
	- trip-service
	- booking-service

After completing Phase 1 the system must support:

- authentication
- fleet management
- booking system
- trip management

---

## This Repository Implementation

This folder contains the independent Phase 1 microservices for this repository.

Run with Docker Compose:

```bash
cd services
docker compose up --build
```

Gateway base URL:

- http://localhost:3200
