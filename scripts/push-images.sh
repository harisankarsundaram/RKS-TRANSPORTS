#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${1:-local}"
TAG="${2:-latest}"

SERVICES=(
  api-gateway
  auth-service
  fleet-service
  trip-service
  booking-service
  tracking-service
  mock-gps-service
  analytics-service
  alert-service
  optimization-service
  ml-service
  frontend
)

for service in "${SERVICES[@]}"; do
  image="${REGISTRY}/rks-${service}:${TAG}"

  echo "Pushing ${image}"
  docker push "${image}"
done

echo "All images pushed successfully"
