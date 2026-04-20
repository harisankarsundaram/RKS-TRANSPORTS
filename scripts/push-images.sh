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

canonical_registry="${REGISTRY%/}"
dockerhub_registry="${canonical_registry#docker.io/}"

for service in "${SERVICES[@]}"; do
  canonical_image="${canonical_registry}/rks-${service}:${TAG}"
  dockerhub_image="${dockerhub_registry}/rks-${service}:${TAG}"

  if ! docker image inspect "${canonical_image}" >/dev/null 2>&1; then
    if docker image inspect "${dockerhub_image}" >/dev/null 2>&1; then
      echo "Retagging ${dockerhub_image} -> ${canonical_image}"
      docker tag "${dockerhub_image}" "${canonical_image}"
    else
      echo "Missing local image tag for ${service}. Expected one of:"
      echo "  - ${canonical_image}"
      echo "  - ${dockerhub_image}"
      echo "Run scripts/build-images.sh before pushing."
      exit 1
    fi
  fi

  echo "Pushing ${canonical_image}"
  docker push "${canonical_image}"
done

echo "All images pushed successfully"
