#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${1:-local}"
TAG="${2:-latest}"
NAMESPACE="${3:-rks-logistics}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
K8S_DIR="${ROOT_DIR}/k8s"
K8S_DEPLOYMENTS_DIR="${K8S_DIR}/deployments"
K8S_SERVICES_DIR="${K8S_DIR}/services"
K8S_INGRESS_DIR="${K8S_DIR}/ingress"
SECRET_FILE="${K8S_DIR}/secret.yaml"

if [[ ! -f "${SECRET_FILE}" ]]; then
  echo "secret.yaml not found, using secret.example.yaml"
  SECRET_FILE="${K8S_DIR}/secret.example.yaml"
fi

echo "Applying base Kubernetes resources"
kubectl apply -f "${K8S_DIR}/namespace.yaml"
kubectl apply -f "${K8S_DIR}/configmap.yaml"
kubectl apply -f "${SECRET_FILE}"

echo "Applying deployment manifests"
for manifest in \
  auth-service-deployment.yaml \
  fleet-service-deployment.yaml \
  trip-service-deployment.yaml \
  booking-service-deployment.yaml \
  tracking-service-deployment.yaml \
  mock-gps-service-deployment.yaml \
  analytics-service-deployment.yaml \
  alert-service-deployment.yaml \
  optimization-service-deployment.yaml \
  ml-service-deployment.yaml \
  api-gateway-deployment.yaml; do
  kubectl apply -f "${K8S_DEPLOYMENTS_DIR}/${manifest}"
done

echo "Applying service manifests"
for manifest in \
  auth-service-service.yaml \
  fleet-service-service.yaml \
  trip-service-service.yaml \
  booking-service-service.yaml \
  tracking-service-service.yaml \
  mock-gps-service-service.yaml \
  analytics-service-service.yaml \
  alert-service-service.yaml \
  optimization-service-service.yaml \
  ml-service-service.yaml \
  api-gateway-service.yaml; do
  kubectl apply -f "${K8S_SERVICES_DIR}/${manifest}"
done

kubectl apply -f "${K8S_INGRESS_DIR}/api-gateway-ingress.yaml"

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
  ml-service; do
  kubectl -n "${NAMESPACE}" rollout status "deployment/${deployment}" --timeout=180s
done

echo "Kubernetes deployment complete"
