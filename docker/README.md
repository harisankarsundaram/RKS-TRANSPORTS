# Docker Stack

This folder provides a single Docker Compose stack for all services under `services/`.

## Quick start

1. Create `docker/.env` from `docker/.env.example` and set `DATABASE_URL`.
2. Start stack:
   - `docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build`
2. Verify gateway:
   - `http://localhost:3200/health`

Notes:

- This compose stack is cloud-DB only; it does not run a local postgres container.

## Included services

- api-gateway (3200)
- auth-service (3201)
- fleet-service (3202)
- trip-service (3203)
- booking-service (3204)
- tracking-service (3205)
- mock-gps-service (3206)
- analytics-service (3207)
- alert-service (3208)
- optimization-service (3209)
- ml-service (8000)
