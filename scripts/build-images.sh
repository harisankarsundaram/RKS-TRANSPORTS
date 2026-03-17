#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${1:-local}"
TAG="${2:-latest}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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
  
  if [ "$service" = "frontend" ]; then
    context="${ROOT_DIR}/${service}"
  else
    context="${ROOT_DIR}/services/${service}"
  fi

  echo "Building ${image} from ${context}"
  docker build -t "${image}" "${context}"
done

echo "All images built successfully"
