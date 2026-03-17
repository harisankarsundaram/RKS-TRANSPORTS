# CI/CD Pipeline (Jenkins)

The pipeline file is located at `ci-cd/Jenkinsfile`.

## Trigger

- `githubPush()` webhook trigger
- Deploy stages run only when branch is `main`

## Stages

1. Checkout
2. Validate Docker Compose
3. Install Dependencies
4. Test
5. Docker Build
6. Docker Push (main only)
7. Deploy to Kubernetes (main only)

## Jenkins prerequisites

- Docker installed on Jenkins agent
- kubectl configured with access to target cluster
- Python 3 available on Jenkins agent
- Credentials:
  - `dockerhub-creds` (username/password)

## How to use

1. In Jenkins job config, set Script Path to `ci-cd/Jenkinsfile`.
2. Configure GitHub webhook to trigger Jenkins.
3. Replace `IMAGE_REGISTRY` with your registry value in Jenkinsfile or through job environment overrides.
4. Ensure `scripts/deploy-k8s.sh` can reach the cluster.
