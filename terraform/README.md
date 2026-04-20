# Terraform: RKS Kubernetes Stack

This Terraform module applies the Kubernetes manifests declared in `k8s/kustomization.yaml`.

## Prerequisites

- Terraform `>= 1.5`
- Access to Kubernetes cluster (`kubectl config get-contexts` should include `rks`)

## Usage

```powershell
cd terraform
terraform init
terraform plan -var="kube_context=rks"
terraform apply -var="kube_context=rks"
```

If kubeconfig is not in the default location:

```powershell
terraform apply -var="kube_context=rks" -var="kubeconfig_path=C:/Users/<you>/.kube/config"
```

## Notes

- This follows the same manifest set as `k8s/kustomization.yaml`.
- Namespace resources are applied first.
- For local browser access after apply, use:

```powershell
./scripts/start-local-access.ps1
```
