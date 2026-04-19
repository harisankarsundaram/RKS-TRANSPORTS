#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${1:-local}"
TAG="${2:-latest}"
NAMESPACE="${3:-rks-logistics}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
K8S_DIR="${ROOT_DIR}/k8s"
SECRET_FILE="${K8S_DIR}/secret.yaml"

if [[ ! -f "${SECRET_FILE}" ]]; then
  echo "Error: ${SECRET_FILE} not found. Create it from k8s/secret.example.yaml before deploying."
  exit 1
fi

echo "Applying Kubernetes stack via kustomize (app + monitoring)"
kubectl apply -k "${K8S_DIR}"

echo "Updating deployment images"
kubectl -n "${NAMESPACE}" set image deployment/api-gateway api-gateway="${REGISTRY}/rks-api-gateway:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/auth-service auth-service="${REGISTRY}/rks-auth-service:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/fleet-service fleet-service="${REGISTRY}/rks-fleet-service:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/trip-service trip-service="${REGISTRY}/rks-trip-service:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/booking-service booking-service="${REGISTRY}/rks-booking-service:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/tracking-service tracking-service="${REGISTRY}/rks-tracking-service:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/mock-gps-service mock-gps-service="${REGISTRY}/rks-mock-gps-service:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/analytics-service analytics-service="${REGISTRY}/rks-analytics-service:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/alert-service alert-service="${REGISTRY}/rks-alert-service:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/optimization-service optimization-service="${REGISTRY}/rks-optimization-service:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/ml-service ml-service="${REGISTRY}/rks-ml-service:${TAG}"
kubectl -n "${NAMESPACE}" set image deployment/rks-frontend frontend="${REGISTRY}/rks-frontend:${TAG}"

echo "Waiting for rollout"
for deployment in \
  api-gateway \
  auth-service \
  fleet-service \
  trip-service \
  booking-service \
  tracking-service \
  mock-gps-service \
  analytics-service \
  alert-service \
  optimization-service \
  ml-service \
  rks-frontend \
  prometheus \
  blackbox-exporter \
  grafana; do
  kubectl -n "${NAMESPACE}" rollout status "deployment/${deployment}" --timeout=180s
done

echo "Kubernetes deployment complete"
