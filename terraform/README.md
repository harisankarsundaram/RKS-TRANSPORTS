# Terraform: RKS Kubernetes Stack

This Terraform module applies the Kubernetes manifests declared in `k8s/kustomization.yaml`.

## Prerequisites

- Terraform `>= 1.5`
- Access to Kubernetes cluster (`kubectl config get-contexts` should include `rks`)
- `kubectl` installed and available on PATH

## Usage

```powershell
cd terraform
terraform init
terraform plan -var="kube_context=rks"
terraform apply -var="kube_context=rks"
```

The module applies `k8s/kustomization.yaml` with `kubectl apply -k`, so it does not need the Terraform Kubernetes provider or provider downloads.

## How To See It Working

After `terraform apply`, run these checks:

```powershell
terraform output
kubectl -n rks-logistics get pods
kubectl -n rks-logistics get svc frontend
kubectl -n rks-logistics rollout status deployment/rks-frontend
```

What to look for:

- `terraform output` should show `applied_resource_count = 43` and `namespace_count = 1`.
- `kubectl get pods` should show the stack running in `rks-logistics`.
- `kubectl get svc frontend` should show `80:30080/TCP`.
- `rollout status` should end with `successfully rolled out`.

If you want to see the actual frontend in a browser, start the local tunnels and open:

```powershell
./scripts/start-local-access.ps1
```

Then browse to `http://127.0.0.1:18080`.

## Notes

- This follows the same manifest set as `k8s/kustomization.yaml`.
- Namespace resources are applied first.
