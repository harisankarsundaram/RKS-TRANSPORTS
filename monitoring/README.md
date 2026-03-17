# Monitoring Stack

This monitoring setup uses Prometheus, Blackbox Exporter, and Grafana.

## What is monitored

- Health endpoint reachability for all services
- Prometheus and Blackbox Exporter runtime status

## Run

1. Start application stack first:
   - `docker compose -f docker/docker-compose.yml --env-file docker/.env up -d`
2. Start monitoring stack:
   - `docker compose -f monitoring/docker-compose.monitoring.yml up -d`

## Access

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` (admin/admin)

## Notes

- Monitoring stack connects to `rks-network` as an external Docker network.
- If `rks-network` does not exist, start the main app stack first.
