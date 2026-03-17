# DevOps Scripts

These scripts automate image build, push, and Kubernetes deployment.

## Files

- `build-images.sh`: builds all service images
- `push-images.sh`: pushes all service images
- `deploy-k8s.sh`: applies manifests and updates deployment images

## Usage

1. Build images:
   - `bash scripts/build-images.sh docker.io/your-username latest`
2. Push images:
   - `bash scripts/push-images.sh docker.io/your-username latest`
3. Deploy to Kubernetes:
   - `bash scripts/deploy-k8s.sh docker.io/your-username latest rks-logistics`
