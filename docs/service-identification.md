# Service Identification Map

This document maps existing transport logistics modules to service folders without changing business logic.

## Module to Service Mapping

- API gateway and request routing: services/api-gateway
- Authentication and user identity: services/auth-service
- Fleet and driver operations: services/fleet-service
- Trip lifecycle and status management: services/trip-service
- Booking and order handling: services/booking-service
- Live GPS tracking: services/tracking-service
- Alerting and notifications: services/alert-service
- Predictive ETA and delay model: services/ml-service
- Analytics and optimization jobs: services/analytics-service

## Notes

- Existing service code was preserved in place.
- No business logic was modified.
- Existing backend and microservices code remains available under legacy-monolith/backend and legacy-monolith/microservices-archive for local compatibility.
