# Kubernetes Local Deployment (Minikube)

This guide deploys the full RKS stack locally on Minikube:

- Backend microservices (auth, fleet, trip, booking, tracking, analytics, alert, optimization)
- API gateway
- ML service (Python)
- Frontend (React + Nginx)
- Postgres (inside Kubernetes)

All resources run in namespace `rks-logistics`.

## 1) Prerequisites

Install and verify:

      minikube version
      kubectl version --client
      docker version

Recommended Minikube profile for this project:

      minikube start -p rks --cpus=4 --memory=8192 --disk-size=30g --driver=docker
      minikube profile rks
      minikube addons enable ingress -p rks

## 2) Build images so Minikube can run them

Option A (recommended for local): build directly into Minikube Docker daemon.

PowerShell:

      minikube -p rks docker-env --shell powershell | Invoke-Expression
      docker build -t DOCKERHUB_USERNAME/rks-auth-service:latest services/auth-service
      docker build -t DOCKERHUB_USERNAME/rks-api-gateway:latest services/api-gateway
      docker build -t DOCKERHUB_USERNAME/rks-booking-service:latest services/booking-service
      docker build -t DOCKERHUB_USERNAME/rks-fleet-service:latest services/fleet-service
      docker build -t DOCKERHUB_USERNAME/rks-trip-service:latest services/trip-service
      docker build -t DOCKERHUB_USERNAME/rks-tracking-service:latest services/tracking-service
      docker build -t DOCKERHUB_USERNAME/rks-mock-gps-service:latest services/mock-gps-service
      docker build -t DOCKERHUB_USERNAME/rks-analytics-service:latest services/analytics-service
      docker build -t DOCKERHUB_USERNAME/rks-alert-service:latest services/alert-service
      docker build -t DOCKERHUB_USERNAME/rks-optimization-service:latest services/optimization-service
      docker build -t DOCKERHUB_USERNAME/rks-ml-service:latest services/ml-service
      docker build -t DOCKERHUB_USERNAME/rks-frontend:latest frontend

Important:

- Keep `DOCKERHUB_USERNAME` in Kubernetes YAML if you built images with that same prefix.
- If you use a different image prefix/tag, update deployment files in `k8s/deployments`.

## 3) Environment variables and secrets

### Non-secret config

Shared internal service URLs are in [k8s/configmap.yaml](configmap.yaml).
They use Kubernetes DNS names like `http://booking-service:3204`.

### Secret config

Edit [k8s/secret.example.yaml](secret.example.yaml) before deploy:

- `JWT_SECRET`
- Postgres values and `DATABASE_URL`

Default local `DATABASE_URL` is already configured for in-cluster Postgres:

   postgresql://postgres:<your_password>@postgres:7519/rks

For production, create secrets with `kubectl create secret` instead of committing values in YAML.

## 4) Deploy everything

From repo root:

      kubectl apply -k k8s

Watch pods until all are Running:

      kubectl get pods -n rks-logistics -w

Check services:

      kubectl get svc -n rks-logistics

Monitoring services exposed by default:

- Grafana NodePort: `30300`
- Prometheus NodePort: `30990`

## 5) Access the frontend

You have 2 easy options.

### Option A: NodePort (quickest)

Frontend service is NodePort `30080`.

      minikube -p rks ip

Open:

      http://<MINIKUBE_IP>:30080

### Option B: Ingress with clean host

Ingress is configured in [k8s/ingress/api-gateway-ingress.yaml](ingress/api-gateway-ingress.yaml) with host `myapp.local`:

- `/` -> frontend service
- `/api` -> api-gateway service

1. Get Minikube IP:

          minikube -p rks ip

2. Add hosts entry (Windows, run editor as Administrator):

          C:\Windows\System32\drivers\etc\hosts

    Add line:

          <MINIKUBE_IP> myapp.local

3. Open:

          http://myapp.local

## 6) Frontend to backend communication

Frontend env is set in [frontend/.env](../frontend/.env):

      VITE_BACKEND_API_URL=/api

Why this works:

- Browser calls `myapp.local/api/...`
- Ingress routes `/api` to `api-gateway`
- Internal services talk using Kubernetes service names from ConfigMap

## 7) Full YAML examples (core patterns)

These are the exact patterns used in this repo.

### Namespace

      apiVersion: v1
      kind: Namespace
      metadata:
         name: rks-logistics

### ConfigMap (shared internal URLs)

      apiVersion: v1
      kind: ConfigMap
      metadata:
         name: rks-shared-config
         namespace: rks-logistics
      data:
         AUTH_SERVICE_URL: http://auth-service:3201
         FLEET_SERVICE_URL: http://fleet-service:3202
         TRIP_SERVICE_URL: http://trip-service:3203
         BOOKING_SERVICE_URL: http://booking-service:3204
         TRACKING_SERVICE_URL: http://tracking-service:3205
         MOCK_GPS_SERVICE_URL: http://mock-gps-service:3206
         ANALYTICS_SERVICE_URL: http://analytics-service:3207
         ALERT_SERVICE_URL: http://alert-service:3208
         OPTIMIZATION_SERVICE_URL: http://optimization-service:3209
         ML_SERVICE_URL: http://ml-service:8000

### Secret (DATABASE_URL and sensitive values)

      apiVersion: v1
      kind: Secret
      metadata:
         name: rks-shared-secrets
         namespace: rks-logistics
      type: Opaque
      stringData:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: <your_password>
         POSTGRES_DB: rks
         DATABASE_URL: postgresql://postgres:tesco123@postgres:7519/rks
         JWT_SECRET: rks_jwt_2026_prod_x8N7s4Qm2L9vR1tK6pD3yH5c

### Deployment (example: auth-service)

      apiVersion: apps/v1
      kind: Deployment
      metadata:
         name: auth-service
         namespace: rks-logistics
      spec:
         replicas: 2
         selector:
            matchLabels:
               app: auth-service
         template:
            metadata:
               labels:
                  app: auth-service
            spec:
               containers:
                  - name: auth-service
                     image: DOCKERHUB_USERNAME/rks-auth-service:latest
                     ports:
                        - containerPort: 3201
                     envFrom:
                        - configMapRef:
                              name: rks-shared-config
                        - secretRef:
                              name: rks-shared-secrets
                     env:
                        - name: PORT
                           value: "3201"
                        - name: DATABASE_URL
                           valueFrom:
                              secretKeyRef:
                                 name: rks-shared-secrets
                                 key: DATABASE_URL

### Service (example: auth-service internal ClusterIP)

      apiVersion: v1
      kind: Service
      metadata:
         name: auth-service
         namespace: rks-logistics
      spec:
         selector:
            app: auth-service
         ports:
            - port: 3201
               targetPort: 3201
               protocol: TCP
         type: ClusterIP

### Frontend NodePort service

      apiVersion: v1
      kind: Service
      metadata:
         name: frontend
         namespace: rks-logistics
      spec:
         selector:
            app: rks-frontend
         ports:
            - name: http
               port: 80
               targetPort: 80
               protocol: TCP
               nodePort: 30080
         type: NodePort

### Ingress (clean URL + API path)

      apiVersion: networking.k8s.io/v1
      kind: Ingress
      metadata:
         name: api-gateway-ingress
         namespace: rks-logistics
      spec:
         ingressClassName: nginx
         rules:
            - host: myapp.local
               http:
                  paths:
                     - path: /api
                        pathType: Prefix
                        backend:
                           service:
                              name: api-gateway
                              port:
                                 number: 80
                     - path: /
                        pathType: Prefix
                        backend:
                           service:
                              name: frontend
                              port:
                                 number: 80

## 8) Debugging: CrashLoopBackOff and Invalid URL

### CrashLoopBackOff checklist

1. Get failing pod names:

          kubectl get pods -n rks-logistics

2. Inspect logs:

          kubectl logs -n rks-logistics <pod-name> --previous

3. Describe pod events:

          kubectl describe pod -n rks-logistics <pod-name>

4. Verify env values inside pod:

          kubectl exec -n rks-logistics <pod-name> -- printenv | findstr DATABASE_URL

5. Verify DB reachability from cluster:

          kubectl run -n rks-logistics net-debug --image=busybox:1.36 --rm -it -- sh
          nc -zv postgres 7519

### Invalid URL checklist

Common cause: bad base URL in frontend.

Expected value in [frontend/.env](../frontend/.env):

      VITE_BACKEND_API_URL=/api

If you changed frontend env, rebuild and redeploy frontend image.

## 9) Local Kubernetes best practices

- Keep backend services as `ClusterIP`; expose only frontend/api externally.
- Use one namespace per app (`rks-logistics`) for clean troubleshooting.
- Keep secrets out of Git for real credentials.
- Use readiness/liveness probes in every service deployment.
- Pin image tags when debugging (avoid silent `latest` drift).
- Apply with kustomize (`kubectl apply -k k8s`) for repeatable deploys.
