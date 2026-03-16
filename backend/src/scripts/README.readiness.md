# Readiness Test Runner

This runner validates backend + microservices end-to-end for:

- Service health checks
- Admin and driver login flows
- Role permissions (admin-only endpoints blocked for driver)
- Dashboard/intelligence/finance API contracts
- Tracking live + trip detail calculation sanity
- ML ETA and delay model behavior (monotonic sensitivity checks)
- GPS routing configuration readiness for future real API usage

## Run Command

From the `backend` folder:

```bash
npm run readiness
```

If you run microservices locally (without Docker), create a runtime env first:

```bash
copy ..\microservices\.env.example ..\microservices\.env
```

Then update `DATABASE_URL` and other values in `microservices/.env` for your machine.

## Useful Options

```bash
node src/scripts/readinessCheck.js --strict
node src/scripts/readinessCheck.js --output=./readiness-report.json
```

- `--strict`: warnings also fail the run.
- `--output`: writes a JSON report to the path you pass.

## Default Credentials Used

The script tries seeded defaults unless you override via env vars:

- Admin: `admin@rks.com` / `1234`
- Driver candidates: `driver.abi@rks.com`, `driver.ravi@rks.com`, `driver.mani@rks.com`, `driver.selva@rks.com`, `driver.yasin@rks.com`, `driver.arun@rks.com`

## Optional Overrides

- `READINESS_ADMIN_EMAIL` or `READINESS_ADMIN_EMAILS`
- `READINESS_ADMIN_PASSWORD`
- `READINESS_DRIVER_EMAIL` or `READINESS_DRIVER_EMAILS`
- `READINESS_DRIVER_PASSWORD`
- `BACKEND_BASE_URL`, `BACKEND_API_URL`
- `AUTH_SERVICE_URL`, `FLEET_SERVICE_URL`, `TRIP_SERVICE_URL`, `BOOKING_SERVICE_URL`
- `TRACKING_SERVICE_URL`, `MOCK_GPS_SERVICE_URL`, `ANALYTICS_SERVICE_URL`, `ALERT_SERVICE_URL`, `ML_SERVICE_URL`
- `OPENROUTESERVICE_API_KEY` (for roadway ETA readiness validation)

## Notes

- If services are down, checks will fail or skip with explicit reasons.
- Run backend seed first if credentials/data are missing:

```bash
npm run seed
```
