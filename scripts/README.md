# DevOps Scripts

These scripts automate image build, push, and Kubernetes deployment.

## Files

- `build-images.sh`: builds all service images
- `push-images.sh`: pushes all service images
- `deploy-k8s.sh`: applies `kubectl apply -k k8s`, updates app images, and waits for app + monitoring rollouts
- `start-local-access.ps1`: starts frontend and api-gateway port-forwards for local browser access
- `stop-local-access.ps1`: stops port-forwards started by `start-local-access.ps1`

## Usage

1. Build images:
   - `bash scripts/build-images.sh docker.io/your-username latest`
2. Push images:
   - `bash scripts/push-images.sh docker.io/your-username latest`
3. Deploy to Kubernetes:
   - `bash scripts/deploy-k8s.sh docker.io/your-username latest rks-logistics`
   - Requires `k8s/secret.yaml` to exist (copy from `k8s/secret.example.yaml` first)

4. Start local browser/API access (PowerShell):
   - `powershell -ExecutionPolicy Bypass -File scripts/start-local-access.ps1`
   - Frontend: `http://127.0.0.1:8080`
   - API health: `http://127.0.0.1:3200/health`

5. Stop local browser/API access:
   - `powershell -ExecutionPolicy Bypass -File scripts/stop-local-access.ps1`
