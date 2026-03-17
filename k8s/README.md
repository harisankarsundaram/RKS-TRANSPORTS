# Kubernetes Manifests

These manifests deploy the full service mesh into the `rks-logistics` namespace.

## Files

- `namespace.yaml`: namespace creation
- `configmap.yaml`: shared non-secret settings and internal service URLs
- `secret.example.yaml`: template for secrets
- `*-service.yaml`: one Deployment + Service pair for each microservice
- `ingress.yaml`: exposes `api-gateway` through NGINX ingress
- `kustomization.yaml`: one-command apply file

## How to deploy

1. Edit `secret.example.yaml` and set a cloud `DATABASE_URL`, then save as `secret.yaml`.
2. Update `kustomization.yaml` to point to `secret.yaml` instead of `secret.example.yaml`.
3. Apply all manifests:
   - `kubectl apply -k k8s`

## Database mode

- Kubernetes manifests are configured for cloud database usage.
- No in-cluster postgres resources are applied by `kustomization.yaml`.

## Quick checks

- Gateway health: `kubectl -n rks-logistics port-forward svc/api-gateway 3200:3200`
- Open: `http://localhost:3200/health`
