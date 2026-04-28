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

canonical_registry="${REGISTRY%/}"
dockerhub_registry="${canonical_registry#docker.io/}"

for service in "${SERVICES[@]}"; do
  canonical_image="${canonical_registry}/rks-${service}:${TAG}"
  dockerhub_image="${dockerhub_registry}/rks-${service}:${TAG}"
  canonical_latest="${canonical_registry}/rks-${service}:latest"
  dockerhub_latest="${dockerhub_registry}/rks-${service}:latest"
  
  if [ "$service" = "frontend" ]; then
    context="${ROOT_DIR}/${service}"
  else
    context="${ROOT_DIR}/services/${service}"
  fi

  echo "Building ${canonical_image} from ${context}"
  docker build -t "${canonical_image}" "${context}"

  # Docker may resolve docker.io-qualified names as unqualified namespace names.
  # Keep both tags so downstream push commands always find a local tag.
  if [ "${dockerhub_image}" != "${canonical_image}" ]; then
    docker tag "${canonical_image}" "${dockerhub_image}"
  fi

  if [ "${TAG}" != "latest" ]; then
    docker tag "${canonical_image}" "${canonical_latest}"
    if [ "${dockerhub_latest}" != "${canonical_latest}" ]; then
      docker tag "${canonical_image}" "${dockerhub_latest}"
    fi
  fi
done

echo "All images built successfully"
