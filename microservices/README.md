# Intelligent Logistics Microservices

This folder adds a microservice architecture for the existing logistics platform.

## Services

- `auth-service` - user auth and JWT login
- `fleet-service` - trucks, drivers, smart text entry parser
- `trip-service` - trip creation, assignment, route recommendation via OpenStreetMap/OSRM
- `booking-service` - customer booking portal APIs and approve/reject flow
- `tracking-service` - live fleet location and trip progress based on GPS logs
- `mock-gps-service` - simulated GPS feed written to `gps_logs` every 5 seconds
- `analytics-service` - fuel anomaly analytics and backhaul opportunity detection
- `ml-service` - FastAPI model service for ETA and delay prediction
- `alert-service` - operational alerts (overspeed, idle, route deviation, delay risk)

## Run with Docker

From this folder:

```bash
docker compose up --build
```

## Key Endpoints

- `POST /bookings` on booking-service
- `POST /bookings/:id/approve` on booking-service
- `GET /tracking/live` on tracking-service
- `GET /tracking/trip/:tripId` on tracking-service
- `POST /predict/eta` on ml-service
- `POST /predict/delay` on ml-service
- `GET /models` on ml-service
- `GET /analytics/fuel/anomalies` on analytics-service
- `GET /analytics/backhaul/suggestions` on analytics-service
- `POST /alerts/evaluate` on alert-service
- `POST /fleet/smart-entry` on fleet-service

## Mock GPS Provider Modes

`mock-gps-service` supports route provider separation so you can keep synthetic GPS now and plug a real provider later:

- `GPS_ROUTE_PROVIDER=mock` (default): uses DB route or synthetic route fallback.
- `GPS_ROUTE_PROVIDER=external`: uses the external provider hook in `mock-gps-service/src/providers/externalRouteProvider.js`.
- `REAL_GPS_API_KEY`: optional key consumed by your external provider implementation.
