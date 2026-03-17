# Transport Logistics DevOps

This repository is organized for CI/CD and Kubernetes deployment while preserving existing business logic.

## Target-Friendly Structure

- frontend/
- services/
  - api-gateway/
  - auth-service/
  - fleet-service/
  - trip-service/
  - booking-service/
  - tracking-service/
  - analytics-service/
  - alert-service/
  - ml-service/
- database/postgres/
- docker/docker-compose.yml
- k8s/deployments/
- k8s/services/
- k8s/ingress/
- ci-cd/Jenkinsfile
- monitoring/prometheus/prometheus.yml
- scripts/build-images.sh
- scripts/push-images.sh
- scripts/deploy-k8s.sh
- docs/

## Local Run (Docker)

1. Start stack:
   - docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
2. Check gateway:
   - http://localhost:3200/health

## Kubernetes Deploy

1. Create k8s/secret.yaml from k8s/secret.example.yaml.
2. Apply manifests:
   - kubectl apply -k k8s
3. Quick check:
   - kubectl -n rks-logistics port-forward svc/api-gateway 3200:80

## Jenkins Pipeline Stages

- Build
- Test
- Docker Build
- Docker Push
- Kubernetes Deploy

## Monitoring

Prometheus configuration includes direct scrape targets for:

- api-gateway
- trip-service
- tracking-service
- ml-service

## Workflow Outcome

Developer push to GitHub
-> GitHub webhook triggers Jenkins
-> Jenkins builds/tests and creates images
-> Images are pushed to registry
-> Kubernetes deploys updated services
-> Public ingress route exposes the application

## Compatibility Notes

- No business logic was changed.
- No existing files were deleted.
- Original monolith backend is archived at legacy-monolith/backend.
- Duplicate microservices are archived at legacy-monolith/microservices-archive.
