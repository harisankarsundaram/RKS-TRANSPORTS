# DevOps Workflow

Target workflow supported by this structure:

Developer pushes code to GitHub
-> GitHub webhook triggers Jenkins
-> Jenkins pipeline builds and tests
-> Docker images are built and pushed
-> Kubernetes manifests are applied
-> Monitoring stack is applied (Prometheus, Blackbox, Grafana)
-> Prometheus probes app and platform health
-> Grafana dashboards visualize availability and latency
-> Services run on AWS Kubernetes cluster
-> Public ingress route exposes api-gateway

## Primary Paths

- CI/CD pipeline: ci-cd/Jenkinsfile
- Local containers: docker/docker-compose.yml
- Kubernetes manifests: k8s/deployments, k8s/services, k8s/ingress
- Monitoring: monitoring/prometheus/prometheus.yml
- K8s monitoring: k8s/monitoring.yaml
- Helper scripts: scripts/build-images.sh, scripts/push-images.sh, scripts/deploy-k8s.sh
