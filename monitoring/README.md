# Monitoring Stack

This monitoring setup uses Prometheus, Blackbox Exporter, and Grafana.

It supports both:

- Local Docker monitoring (`monitoring/docker-compose.monitoring.yml`)
- Kubernetes monitoring (`k8s/monitoring.yaml` via `kubectl apply -k k8s`)

## What is monitored

- Health endpoint reachability for all services
- Prometheus and Blackbox Exporter runtime status
- Frontend availability
- Monitoring platform health (Prometheus, Grafana, Blackbox)

## Run

1. Start application stack first:
   - `docker compose -f docker/docker-compose.yml --env-file docker/.env up -d`
2. Start monitoring stack:
   - `docker compose -f monitoring/docker-compose.monitoring.yml up -d`
3. Validate targets:
   - Open `http://localhost:9090/targets`
4. Open Grafana dashboard:
   - `RKS Logistics / RKS Logistics Observability`

## Access

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` (admin/admin)

## Kubernetes Access

After deploying with `kubectl apply -k k8s`:

- Grafana NodePort: `http://<node-ip>:30300`
- Prometheus NodePort: `http://<node-ip>:30990`

For Minikube:

- `minikube -p rks ip`
- Use the returned IP as `<node-ip>`.

## Notes

- Monitoring stack connects to `rks-network` as an external Docker network.
- If `rks-network` does not exist, start the main app stack first.
- Dashboard and datasource are provisioned automatically on container start.
