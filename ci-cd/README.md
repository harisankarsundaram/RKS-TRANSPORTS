# CI/CD Pipeline (Jenkins)

The pipeline file is located at `ci-cd/Jenkinsfile`.

## Trigger

- `githubPush()` webhook trigger in Jenkins pipeline
- GitHub webhook should target Jenkins endpoint:
  - `http://<jenkins-host>/github-webhook/`
- Optional `.github/workflows/devops.yml` job can trigger Jenkins via `JENKINS_WEBHOOK_URL` secret

## Stages

1. Checkout
2. Validate Toolchain
3. Validate Parameters
4. Build (install dependencies + validate Docker Compose)
5. Test
6. Docker Build
7. Docker Push (when `PUSH_IMAGES=true`)
8. Apply Kubernetes Secret (when `DEPLOY_K8S=true`)
9. Kubernetes Deploy (when `DEPLOY_K8S=true`)
10. Verify Monitoring (Prometheus/Grafana/Blackbox)

## Jenkins prerequisites

- Docker installed on Jenkins agent
- kubectl configured with access to target cluster
- Python 3 available on Jenkins agent
- Node.js + npm available on Jenkins agent
- Credentials:
  - `dockerhub-creds` (username/password)

## Jenkins parameters (recommended)

- `PUSH_IMAGES`: `true` for release builds
- `DEPLOY_K8S`: `true` for deployment builds
- `DOCKER_CREDENTIALS_ID`: `dockerhub-creds`
- `GIT_BRANCH`: optional override for manual run

## Local Jenkins (ready-to-run)

1. Start Jenkins:
  - `docker compose -f ci-cd/docker-compose.jenkins.yml up -d --build`
2. Open Jenkins:
  - `http://localhost:8080`
3. Get initial admin password:
  - `docker exec rks-jenkins cat /var/jenkins_home/secrets/initialAdminPassword`
4. Install suggested plugins when prompted.
5. Create Pipeline job from SCM and set Script Path to `ci-cd/Jenkinsfile`.

## GitHub webhook integration

1. In Jenkins job, enable `GitHub hook trigger for GITScm polling`.
2. In GitHub repository:
  - Settings -> Webhooks -> Add webhook
  - Payload URL: `http://<jenkins-host>/github-webhook/`
  - Content type: `application/json`
  - Events: `Just the push event`
3. Save and verify webhook delivery as `200`.

## How to use

1. In Jenkins job config, set Script Path to `ci-cd/Jenkinsfile`.
2. Configure GitHub webhook to trigger Jenkins.
3. Replace `IMAGE_REGISTRY` with your registry value in Jenkinsfile or through job environment overrides.
4. Ensure `scripts/deploy-k8s.sh` can reach the cluster.
5. For deployment runs, build with parameters:
  - `PUSH_IMAGES=true`
  - `DEPLOY_K8S=true`

## One-command automation from terminal

You can automate Jenkins job creation and GitHub webhook setup from PowerShell.

1. Configure Jenkins pipeline job from terminal:
  - `./scripts/setup-jenkins-pipeline.ps1 -AdminUser <jenkins-user> -ApiToken <jenkins-api-token> -JobName rks-transports-ci-cd -Branch main -DockerCredentialsId dockerhub-creds`

2. Configure Docker credentials in Jenkins during setup:
  - `./scripts/setup-jenkins-pipeline.ps1 -AdminUser <jenkins-user> -ApiToken <jenkins-api-token> -DockerCredentialsId dockerhub-creds -DockerUsername <docker-user> -DockerPassword <docker-pass>`

3. Trigger first build from terminal:
  - `./scripts/setup-jenkins-pipeline.ps1 -AdminUser <jenkins-user> -ApiToken <jenkins-api-token> -TriggerBuild -PushImages $false -DeployK8s $false`

4. Create or update GitHub webhook from terminal:
  - `./scripts/setup-github-webhook.ps1 -GitHubToken <github-token> -Owner <owner> -Repo <repo> -WebhookUrl http://<jenkins-host>/github-webhook/`

Notes:
- Use Jenkins API token, not account password.
- For local Jenkins, webhook delivery from GitHub requires a public tunnel or reachable host.
- If you expose Jenkins publicly, secure it with HTTPS and an ingress/proxy.

## Deliverables mapping

- Jenkins pipeline: `ci-cd/Jenkinsfile`
- Kubernetes manifests: `k8s/kustomization.yaml` + files in `k8s/deployments`, `k8s/services`, `k8s/ingress`
- Monitoring dashboard + stack: `k8s/monitoring.yaml`
