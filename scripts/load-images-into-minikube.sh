#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${1:-local}"
TAG="${2:-latest}"
MINIKUBE_CONTAINER="${3:-rks}"

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

if ! docker inspect "${MINIKUBE_CONTAINER}" >/dev/null 2>&1; then
  echo "Minikube container '${MINIKUBE_CONTAINER}' not found"
  exit 1
fi

if [ "$(docker inspect -f '{{.State.Running}}' "${MINIKUBE_CONTAINER}" 2>/dev/null || echo false)" != "true" ]; then
  echo "Minikube container '${MINIKUBE_CONTAINER}' is not running"
  exit 1
fi

if ! docker exec "${MINIKUBE_CONTAINER}" sh -lc 'command -v docker >/dev/null 2>&1'; then
  echo "Docker CLI not available in '${MINIKUBE_CONTAINER}'"
  exit 1
fi

for service in "${SERVICES[@]}"; do
  canonical_image="${canonical_registry}/rks-${service}:${TAG}"
  dockerhub_image="${dockerhub_registry}/rks-${service}:${TAG}"
  canonical_latest="${canonical_registry}/rks-${service}:latest"
  dockerhub_latest="${dockerhub_registry}/rks-${service}:latest"

  if ! docker image inspect "${canonical_image}" >/dev/null 2>&1; then
    if docker image inspect "${dockerhub_image}" >/dev/null 2>&1; then
      echo "Retagging ${dockerhub_image} -> ${canonical_image}"
      docker tag "${dockerhub_image}" "${canonical_image}"
    else
      echo "Local image not found for ${service}: ${canonical_image}"
      exit 1
    fi
  fi

  echo "Loading ${canonical_image} into ${MINIKUBE_CONTAINER}"
  docker save "${canonical_image}" | docker exec -i "${MINIKUBE_CONTAINER}" docker load >/dev/null

  if [ "${TAG}" != "latest" ]; then
    if ! docker image inspect "${canonical_latest}" >/dev/null 2>&1; then
      docker tag "${canonical_image}" "${canonical_latest}"
    fi

    if [ "${dockerhub_latest}" != "${canonical_latest}" ]; then
      docker tag "${canonical_image}" "${dockerhub_latest}"
    fi

    echo "Loading ${canonical_latest} into ${MINIKUBE_CONTAINER}"
    docker save "${canonical_latest}" | docker exec -i "${MINIKUBE_CONTAINER}" docker load >/dev/null
  fi

done

echo "All images loaded into Minikube container ${MINIKUBE_CONTAINER}"
