#!/usr/bin/env bash
# End-to-end smoke test of the Helm chart on a throwaway k3s cluster running
# in Docker. Needs only Docker: helm and kubectl run inside containers.
#
#   deploy/scripts/k3s-smoke-test.sh          # run, then tear the cluster down
#   KEEP=1 deploy/scripts/k3s-smoke-test.sh   # leave it running to explore
#
# What it checks:
#   - every pod becomes Ready (2 API replicas + dedicated scheduler, Kafka
#     consumer, Fluent Bit, frontend, dev Postgres/Redis/Kafka)
#   - only the scheduler pod runs health checks
#   - demo-app traffic flows nginx → Fluent Bit → Kafka → consumer → discovery
#   - the remediation runner can restart/scale in its target namespace and
#     is denied (403) elsewhere
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHART="$ROOT/deploy/helm/api-monitor"
NET=api-monitor-k3s
NODE=api-monitor-k3s
K3S_IMAGE=rancher/k3s:v1.30.6-k3s1
HELM_IMAGE=alpine/helm:3.16.2
WORK="$(mktemp -d)"

k() { docker exec "$NODE" kubectl "$@"; }
helm() { docker run --rm --network "$NET" -v "$CHART":/chart -v "$WORK/kubeconfig":/root/.kube/config:ro "$HELM_IMAGE" "$@"; }
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$*"; exit 1; }
pass() { printf '\033[32mPASS\033[0m %s\n' "$*"; }

cleanup() {
  if [[ "${KEEP:-}" == "1" ]]; then
    echo "Cluster left running. kubectl: docker exec $NODE kubectl ...   Remove: docker rm -f $NODE && docker network rm $NET"
  else
    docker rm -f "$NODE" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

step "Building images"
(cd "$ROOT" && docker compose build backend frontend >/dev/null)
docker tag pet_project-backend api-monitor-backend:1.0.0
docker tag pet_project-frontend api-monitor-frontend:1.0.0

step "Starting k3s"
docker network create "$NET" >/dev/null 2>&1 || true
docker rm -f "$NODE" >/dev/null 2>&1 || true
docker run -d --name "$NODE" --privileged --network "$NET" "$K3S_IMAGE" \
  server --disable traefik --disable metrics-server --tls-san "$NODE" >/dev/null
for _ in $(seq 1 60); do k get nodes 2>/dev/null | grep -q " Ready" && break; sleep 3; done
k get nodes | grep -q " Ready" || fail "k3s node never became Ready"
docker exec "$NODE" cat /etc/rancher/k3s/k3s.yaml | sed "s#https://127.0.0.1:6443#https://$NODE:6443#" > "$WORK/kubeconfig"
chmod 600 "$WORK/kubeconfig"

step "Loading images into the cluster"
for img in postgres:15 redis:7-alpine apache/kafka:3.9.0 fluent/fluent-bit:3.1.9 nginxinc/nginx-unprivileged:1.27-alpine; do
  docker image inspect "$img" >/dev/null 2>&1 || docker pull -q "$img" >/dev/null
done
docker save api-monitor-backend:1.0.0 api-monitor-frontend:1.0.0 postgres:15 redis:7-alpine apache/kafka:3.9.0 \
  fluent/fluent-bit:3.1.9 nginxinc/nginx-unprivileged:1.27-alpine | docker exec -i "$NODE" ctr images import - >/dev/null

step "Deploying demo workloads"
docker exec -i "$NODE" kubectl apply -f - >/dev/null <<'EOF'
apiVersion: v1
kind: Namespace
metadata: { name: production-apps }
---
apiVersion: v1
kind: Namespace
metadata: { name: other-team }
---
apiVersion: v1
kind: Namespace
metadata: { name: api-monitor }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: demo-app, namespace: production-apps }
spec:
  replicas: 2
  selector: { matchLabels: { app: demo-app } }
  template:
    metadata: { labels: { app: demo-app } }
    spec:
      containers:
        - { name: web, image: nginxinc/nginx-unprivileged:1.27-alpine, imagePullPolicy: Never, ports: [{ containerPort: 8080 }] }
---
apiVersion: v1
kind: Service
metadata: { name: demo-app, namespace: production-apps }
spec:
  selector: { app: demo-app }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: other-app, namespace: other-team }
spec:
  replicas: 1
  selector: { matchLabels: { app: other-app } }
  template:
    metadata: { labels: { app: other-app } }
    spec:
      containers:
        - { name: web, image: nginxinc/nginx-unprivileged:1.27-alpine, imagePullPolicy: Never }
EOF

step "helm install"
helm install demo /chart -n api-monitor \
  --set image.pullPolicy=Never \
  --set api.replicas=2 --set scheduler.separate=true \
  --set remediation.enabled=true --set 'remediation.targetNamespaces={production-apps}' \
  --set fluentBit.enabled=true --set 'fluentBit.namespaces={production-apps}' \
  --set postgresql.storage=1Gi --set kafka.storage=1Gi >/dev/null

step "Waiting for pods"
for _ in $(seq 1 80); do
  not_ready=$(k get pods -n api-monitor --no-headers 2>/dev/null | awk '{split($2,a,"/"); if (a[1]!=a[2] || $3!="Running") print}' | wc -l)
  [[ "$not_ready" -eq 0 && "$(k get pods -n api-monitor --no-headers | wc -l)" -ge 9 ]] && break
  sleep 5
done
k get pods -n api-monitor
[[ "$not_ready" -eq 0 ]] || fail "pods not ready"
pass "all pods Ready"

step "Scheduler runs once"
runs=0
for pod in $(k get pods -n api-monitor -l 'app.kubernetes.io/component in (api,scheduler)' -o name); do
  k logs -n api-monitor "$pod" --all-containers | grep -q "Monitoring scheduler started" && runs=$((runs + 1))
done
[[ "$runs" -eq 1 ]] || fail "scheduler running in $runs pods"
pass "scheduler running in exactly 1 of 3 backend pods"

step "Log pipeline: demo-app → Fluent Bit → Kafka → discovery"
k -n production-apps run traffic --image=nginxinc/nginx-unprivileged:1.27-alpine --image-pull-policy=Never --restart=Never \
  --command -- sh -c 'for i in $(seq 1 60); do wget -qO- http://demo-app/ >/dev/null; wget -q -O /dev/null http://demo-app/products/$i 2>/dev/null; done; true' >/dev/null
routes=""
for _ in $(seq 1 30); do
  routes=$(k -n api-monitor exec deploy/demo-api-monitor-frontend -- wget -qO- "127.0.0.1:8080/api/discovery/routes?host=demo-app.production-apps.svc" 2>/dev/null || true)
  echo "$routes" | grep -q '/products/:id' && break
  sleep 5
done
echo "$routes" | grep -q '"path_template":"/products/:id"' || fail "demo-app routes not discovered: $routes"
pass "discovered demo-app.production-apps.svc /products/:id from container logs"

step "Remediation RBAC"
API=$(k -n api-monitor get pods -l app.kubernetes.io/component=api -o name | head -1)
runner() { k -n api-monitor exec "$API" -c api -- node -e "require('./dist/services/kubernetesRunner.service').$1.then(r=>console.log(JSON.stringify(r)),e=>{console.log(e.message);process.exit(2)})"; }
runner "rolloutRestartDeployment('production-apps','demo-app')" || fail "rollout restart failed"
runner "scaleDeployment('production-apps','demo-app',1)" | grep -q '"to":3' || fail "scale failed"
[[ "$(k -n production-apps get deploy demo-app -o jsonpath='{.spec.replicas}')" == "3" ]] || fail "replicas not 3"
pass "restarted and scaled production-apps/demo-app"
if out=$(runner "rolloutRestartDeployment('other-team','other-app')" 2>&1); then fail "other-team was not denied"; fi
echo "$out" | grep -q "403" || fail "expected 403, got: $out"
pass "denied in other-team (403)"

printf '\n\033[32mSmoke test passed.\033[0m\n'
