# 📋 Enterprise AIOps Platform — Master Roadmap & Implementation TODO

> **Originating Source:** Executive Manager Feedback & Architecture Directives  
> **Target Platform:** Universal API Monitoring, AIOps, Observability & Remediation Platform  
> **Runtime Environment:** Kubernetes & OpenShift Container Platform (Microservices in Pods)  
> **Last Updated:** October 2026

---

## 🎯 Executive Overview & Manager Directives

### Raw Manager Feedback
```text
"API performance testing engine, run concurrent bulk endpoint requests, 
Monitor internal services, apis, endpoints, pods, bugs observability
Auto-detection
Auto-remediation
Decison layer (Human in the loop then automate later)
They will be microservices, they will be in pods (openshift clusters and kubernetes)
Add chat bots/AI

AUTO-DETECT ENDPOINTS/PODS/SERVICES FROM LOGS, AUTO-ADD
NOTIFICATION ENGINES (SEND SMS/EMAIL TO GROUPS/INDIVIDUALS (MAILING GROUPS) TO SERVICENOW LOG TICKETS) ABOUT FAILINGS
KAFKA FOR GOING THROUGH BIG LOGS, STORE TO PROGRESQL
TO HAVE RCA (RECOMMENDATION ENGINES)
AUTO-REMEDIATION
TOPOLOGY FUNCTIONALITIES (EXTREMELY CRITICAL)
TRACEROUTES
LOG INCIDENCES (UNIQUE REFERENCES)

EXECUTIVE SUMMARY PAGE"
```

---

## 🧭 Directives to Engineering Deliverables Mapping

| # | Feedback Directive | Deliverable Component | Priority | Status |
|---|---|---|---|---|
| **1** | Concurrent Bulk Performance Testing | Multi-endpoint load generator with configurable curves ($p50, p95, p99$) | High | 🟢 Completed (single worker; distributed pending) |
| **2** | Pods & Microservices Observability | Kubernetes API daemon watching pod states, restarts, OOMKilled, limits | High | ⚪ Pending cluster credentials |
| **3** | Auto-Detect Endpoints & Pods from Logs | Access log harvesting engine parsing URIs, normalizer & auto-catalog | High | 🟢 Completed (HTTP/file ingest; Kafka source pending) |
| **4** | Kafka Big Log Pipeline $\to$ PostgreSQL | Apache Kafka broker, consumer worker pool, partitioned PostgreSQL tables | High | 🟢 Completed |
| **5** | **Topology Functionalities** | **Interactive service dependency graph with dynamic health & blast radius** | **CRITICAL** | 🟢 Completed (Phase 1) |
| **6** | Network Traceroutes | Hop-by-hop latency and packet loss diagnostic visualizer | High | 🟢 Completed (Phase 1) |
| **7** | Unique Reference Incident Management | Incident state engine (`INC-YYYYMMDD-XXXX`), timeline, SLA tracking | High | 🟢 Completed (Phase 2) |
| **8** | Multi-Channel Notifications & ServiceNow | Email lists, SMS gateways (Twilio/SMPP), two-way ServiceNow Table API | High | 🟢 Completed (Phase 2) |
| **9** | RCA & Recommendation Engine | Correlative root cause engine + prescriptive actionable runbooks | High | 🟢 Completed (pod signals pending cluster) |
| **10** | Decision Layer & Auto-Remediation | Approval gate (Human-in-the-Loop) + K8s action runner (pod restart, scale) | High | 🟢 Completed (K8s runner awaiting cluster) |
| **11** | OpenShift/Kubernetes Deployment | Microservices containerized in pods, Helm charts, OpenShift Routes | High | 🟢 Helm chart (k3s-verified; OpenShift pending) |
| **12** | Chatbots / AI Operations Agent | Gemini 3.8 Flash agent with incident summary & remediation tool calling | High | 🟢 Operational (Hybrid) |
| **13** | Executive Summary Page | C-level KPI dashboard: fleet SLA % vs target, MTTD, MTTR, domain health | High | 🟢 Completed (Phase 1) |

---

## 🚀 Phased Implementation Checklist

---

### Phase 1: Real-Time Topology Engine, Traceroutes & Executive Summary Page
> **Focus:** Deliver the most visually impactful and critical items flagged by leadership.

#### 1.1 Service Topology Graph (EXTREMELY CRITICAL)
- [x] Install/build interactive topology visualization engine (`TopologyGraph.tsx`)
- [x] Create Topology Page (`frontend/src/pages/Topology.tsx`) and sidebar navigation link
- [x] Define Topology Data Model:
  - [x] Service Nodes: Microservices, Ingress Routers, Pods, Databases (PostgreSQL, Redis, Kafka), 3rd-party APIs
  - [x] Dependency Edges: Traffic direction, live RPS throughput, latency ($ms$), error rate ($0\%$)
- [x] Dynamic Health Color Coding:
  - [x] 🟢 Healthy (SLA $>99\%$, $p95 < 200\text{ms}$, 0 errors)
  - [x] 🟡 Degraded (Latency spikes, packet loss $>2\%$)
  - [x] 🔴 Outage (Pod CrashLoop, 5xx server errors, connection refused)
- [x] Interactive Blast Radius Inspector:
  - [x] Click node to highlight upstream callers and downstream dependencies
  - [x] Quick drilldown drawer showing active incidents, endpoints, and pod logs
- [x] Backend Topology Service (`backend/src/services/topology.service.ts` & `topology.routes.ts`):
  - [x] Discover and infer dependency edges from traffic logs and synthetic targets
  - [x] Expose `GET /api/topology` with live fleet health rollups

#### 1.2 Network Traceroutes & Path Diagnostics
- [x] Create Traceroute Service (`backend/src/services/traceroute.service.ts` & `traceroute.routes.ts`):
  - [x] Multi-hop network probe (DNS lookup time, TCP socket handshake RTT, ingress gateway, service mesh)
  - [x] Identify gateway bottlenecks, firewall drops, ISP latency, target server delays
- [x] Visual Traceroute Timeline Component (`frontend/src/components/TracerouteModal.tsx`):
  - [x] Visual hop cards with latency per hop, IP address, resolved ASN/host, status, packet loss
- [x] Integrated diagnostic action on Endpoint Details page and on-demand URL trace bar

#### 1.3 Executive Summary Page
- [x] Create Executive Dashboard Page (`frontend/src/pages/ExecutiveSummary.tsx`)
- [x] High-Level Leadership KPI Scorecards:
  - [x] Overall Fleet Availability vs SLA Commitment ($99.94\%$ vs $99.90\%$ Target)
  - [x] Mean Time to Detect (MTTD - 18s)
  - [x] Mean Time to Resolve (MTTR - 3.8m)
  - [x] Total Incidents Avoided / Outage Minutes Prevented
  - [x] Financial & SLA Breach Risk exposure
- [x] Business Domain Grouping:
  - [x] Health status cards grouped by line-of-business (Core Financial, Customer Portal, Platform Data, Partner Integrations)
- [x] 30-Day SLA & Latency Trend (Recharts ComposedChart visualizer with 99.9% commitment line)
- [x] Executive Incident Postmortem Rollup with Unique Reference schemes (`INC-202610-0042`)
- [x] Exportable Executive Briefing (Print/PDF ready layout)

---

### Phase 2: Enterprise Incidents, Multi-Channel Notifications & ServiceNow
> **Focus:** Full operational incident governance and enterprise communication.

#### 2.1 Enterprise Incident Lifecycle & Unique References
- [x] Upgrade Incident Model with Unique References:
  - [x] Reference scheme: `INC-YYYYMMDD-XXXX` (e.g. `INC-202610-0042`)
- [x] Incident State Machine:
  - [x] `TRIGGERED` $\to$ `ACKNOWLEDGED` $\to$ `INVESTIGATING` $\to$ `MITIGATED` $\to$ `RESOLVED` $\to$ `CLOSED`
- [x] Incident Timeline & Postmortem Trail:
  - [x] Correlated event timeline: Check failures, pod logs, traceroutes, remediation attempts
  - [x] Affected endpoints, microservices, and estimated blast radius
- [x] Incidents Management Console UI (`frontend/src/pages/Incidents.tsx`)

#### 2.2 Multi-Channel Notification Engine
- [x] Notification Dispatcher Service (`backend/src/services/notification.service.ts` & `incident.routes.ts`):
  - [x] Rule-based notification policies (Severity P1/P2/P3/P4, quiet hours, escalation timers)
  - [x] Anti-flapping & alert deduplication (suppress duplicate notifications within alert window)
- [x] Email Dispatcher:
  - [x] Formatted HTML incident digests for individual engineers and group mailing distribution lists
- [x] SMS Gateway:
  - [x] SMS emergency alert dispatcher for emergency P1 on-call alerting
- [x] Multi-Channel Notification logs & audit trail

#### 2.3 ServiceNow Incident Integration
- [x] ServiceNow Client (`backend/src/services/serviceNow.service.ts`):
  - [x] ServiceNow Table API integration (`POST /api/now/table/incident` & `PATCH /api/now/table/incident/:id`)
  - [x] Map platform incidents to ServiceNow fields (Short Description, Caller, Category, Impact, Urgency)
  - [x] Store external ServiceNow ticket reference (`sys_id`, `number` e.g. `INC0019283`)
  - [x] Bi-directional sync: Update ticket status to `Resolved` when incident resolves in API Monitor

#### 2.4 Auto-Detection → Incident Loop
- [x] Incident detector (`backend/src/services/incidentDetector.service.ts`) evaluated after every health check:
  - [x] Open incident after `INCIDENT_FAILURE_THRESHOLD` (default 3) consecutive failures, classified via `rootCause.service.ts`
  - [x] One open incident per endpoint (no duplicates while failing)
  - [x] Auto-resolve after `INCIDENT_RECOVERY_THRESHOLD` (default 2) consecutive passes, syncing ServiceNow
  - [x] Manual resolves require fresh failures before re-opening
- [x] Incident record inserted before ServiceNow sync; reference collisions retried

---

### Phase 3: Kafka Log Ingestion, Big Logs Pipeline & Auto-Discovery
> **Focus:** High-throughput streaming log ingestion and zero-touch auto-discovery.

#### 3.1 Apache Kafka Event Streaming Infrastructure
- [x] Apache Kafka (KRaft) in `docker-compose.yml` (`--profile kafka`) and the Helm chart
- [x] Core Kafka Topics (created by the app; optional `KAFKA_TOPIC_PREFIX`):
  - [x] `telemetry.raw-logs` (High-volume application & access logs)
  - [x] `telemetry.access-logs` (Parsed ingress/router HTTP requests)
  - [x] `telemetry.events` (incident triggered / status changed, route discovered)
- [x] Kafka Producer / Log Shipper Configuration:
  - [x] Fluent Bit DaemonSet (Helm `fluentBit.enabled`) forwarding container logs to Kafka, with Kubernetes metadata
  - [x] Replay script for demos (`npm run kafka:produce`)

#### 3.2 Kafka Consumer & PostgreSQL Big Data Storage
- [x] Kafka Consumer Microservice (`backend/src/consumer.ts`, `logConsumer.service.ts`):
  - [x] Consumer group with configurable concurrency; bounded fetches + commit-after-write for backpressure (at-least-once)
  - [x] Batched `unnest` inserts into PostgreSQL; raw rows + catalog updates in one transaction (no double counting on redelivery)
- [x] PostgreSQL Schema Optimization:
  - [x] Monthly range partitioning (`access_logs_y2026m10`), partitions created on demand
  - [x] Retention policy (`ACCESS_LOG_RETENTION_DAYS`) dropping whole partitions daily

#### 3.3 Auto-Detect Endpoints, Pods & Services from Logs (Auto-Add)
- [x] Access Log Pattern Parser (`backend/src/services/logParser.service.ts`):
  - [x] Extract HTTP method, path, status, latency, host, upstream pod, service name
  - [x] Formats: nginx/Apache common & combined (+vhost), OpenShift router (HAProxy), Envoy/JSON, Fluent Bit Kubernetes wrapper, morgan-style app logs
- [x] Route Regex Normalizer:
  - [x] Parameterize dynamic IDs (`/api/v1/users/49102` → `/api/v1/users/:id`; also `:uuid`, `:hash`, `:date`, `:email`, `:token`)
  - [ ] Collapse high-cardinality literal segments (e.g. usernames) by sibling analysis — currently capped at 500 routes per host instead
- [x] Auto-Catalog Engine (`logDiscovery.service.ts`, `POST /api/discovery/ingest` & `/upload`):
  - [x] Detect previously unseen endpoints and microservices; per-route traffic stats (requests, 5xx rate, avg & p95 latency, status mix, pods)
  - [x] Recognize routes already covered by a monitored endpoint
  - [x] Promoted endpoints tagged `SOURCE_LOG_DISCOVERED`; optional `LOG_DISCOVERY_AUTO_PROMOTE`
  - [x] Baseline synthetic health probe for each new GET route
  - [x] Discovered services feed the topology graph with real error rate, latency and pod counts
- [x] Discovery Review Console in UI (`frontend/src/pages/Discovery.tsx`):
  - [x] View newly discovered endpoints from logs with 1-click promotion to monitoring (GET only), ignore/restore
  - [x] Paste or upload logs; sample at `dev/sample-logs/access-log-sample.txt`

#### 3.4 Multi-Endpoint Concurrent Performance Testing Suite
- [x] Multi-endpoint scenario suites with traffic weights (`backend/src/services/loadSuite.service.ts`, `/api/load-suites`)
- [x] Configurable test profiles: virtual users (≤200), ramp-up, duration (≤600s), optional RPS cap
- [x] Real-time execution telemetry over SSE: per-second throughput, error rate %, latency percentiles ($p50, p90, p95, p99), active VUs; per-endpoint summary with status breakdown
- [x] Dedicated worker thread (`backend/src/workers/loadWorker.ts`) isolates load generation from core API monitoring; one run at a time, cancellable, interrupted runs recovered on restart
- [x] Load Testing console (`frontend/src/pages/LoadTesting.tsx`): suite builder, live charts, run history
- [ ] Distributed load (multiple `perf-worker` pods) — single worker thread today

---

### Phase 4: Decision Layer, Auto-Remediation & Kubernetes/OpenShift Deployment
> **Focus:** Close the loop with intelligent recommendations, human approval, and cluster deployment.

#### 4.1 Prescriptive RCA & Recommendation Engine
- [x] Multi-signal RCA correlator (`backend/src/services/rcaEngine.service.ts`):
  - [x] Correlates check history, failure onset & flapping, latency baseline vs pre-onset trend, same-host and fleet-wide failures, recent config changes, and a live DNS/TCP probe
  - [ ] Cross-reference pod restart events, OOMKilled errors, and DB connection metrics (needs cluster access)
  - [x] Generate structured root-cause diagnosis (category, confidence, scope, evidence) — runs automatically on auto-detected incidents, re-runnable via `POST /api/incidents/:id/rca`
- [x] Prescriptive Recommendation Generator:
  - [x] Typed runbook steps with risk levels (`reprobe`, `run_traceroute`, `update_endpoint_timeout`, `reduce_check_frequency`, `rollout_restart`, `scale_deployment`, `manual`)
  - [x] RCA panel on the Incidents console; RCA included in chatbot `get_incident_details`

#### 4.2 Decision Layer & Auto-Remediation Engine
- [x] Human-in-the-Loop Approval Workflow (`backend/src/services/remediation.service.ts`, `/api/remediation`):
  - [x] Each RCA runbook step becomes a Remediation Plan with unique ID (`REC-XXXX`); re-analysis supersedes pending plans
  - [x] Approval Card in UI (`RemediationPanel.tsx`) and AI Chatbot (`approve_remediation`); plan posted to the ServiceNow ticket as a work note (when credentials are set)
  - [x] Every execution requires a named operator's approval; chat can't approve high-risk steps; plans on resolved incidents are refused
  - [ ] Real authentication — approver identity is currently self-declared
- [x] Action Execution Runners:
  - [x] Kubernetes API Action Runner (`kubernetesRunner.service.ts`, direct API calls; in-cluster ServiceAccount or `K8S_API_URL`/`K8S_TOKEN`):
    - [x] `rolloutRestartDeployment(namespace, name)`
    - [x] `scaleDeployment(namespace, name, delta)` (capped by `K8S_MAX_REPLICAS`)
    - [ ] `deleteFailedPod(namespace, podName)`
    - [ ] Verified against a real cluster (tested against a mock API server only)
  - [x] Monitoring runners: re-probe, raise check timeout, reduce check frequency, network path diagnostic
  - [ ] Cache & Network Action Runners: Flush cache, toggle circuit breaker
- [x] Verification & Audit Trail:
  - [x] Re-probe endpoint post-remediation to verify recovery (K8s actions after 60s); recovered → incident MITIGATED
  - [x] Full audit record (`remediation_audit`): triggering incident, proposed action, approver identity, execution result, verification
- [x] Auto-Pilot Toggle:
  - [x] Administrators can mark low-risk actions as `AUTOPILOT` (zero-touch execution); medium/high-risk actions are not eligible

#### 4.3 Chatbot & AI Assistant Expansion
- [ ] Integrate new tool definitions in `backend/src/services/chatTools.ts`:
  - [x] `get_incident_details`: Retrieve incident history and RCA by unique ID (`INC-XXXX`)
  - [ ] `get_service_topology`: Query upstream/downstream dependencies for a service
  - [x] `approve_remediation` / `list_pending_remediations`: Conversational approval of pending remediation runbooks
  - [x] `run_traceroute`: Dispatch network hop diagnostics on demand
- [ ] UI enhancements in `frontend/src/components/ChatWidget.tsx` for visual action cards

#### 4.4 Microservices Architecture & OpenShift/Kubernetes Deployment
- [x] Separate workloads from one backend image (`deploy/helm/api-monitor`):
  - [x] `frontend-dashboard` (nginx-unprivileged, proxies `/api`)
  - [x] `core-api-bff` (API Deployment, scalable with sticky sessions)
  - [x] `synthetics-engine` (dedicated single-replica scheduler Deployment)
  - [x] `kafka-log-consumer` (consumer Deployment)
  - [ ] Separate `perf-worker`, `remediation-engine`, `notification-service` images (run inside the API/scheduler today)
- [x] Kubernetes & OpenShift Manifests / Helm Chart:
  - [x] Deployments, StatefulSets (dev datastores), Services, ConfigMaps, Secrets (or `existingSecret`)
  - [x] OpenShift Route (SSE-friendly timeout) & Ingress
  - [x] ServiceAccount with namespaced RBAC to restart/scale Deployments in target namespaces
  - [x] Resource requests & limits, startup/liveness/readiness probes (`/health`, `/ready`), advisory-locked migrations in init containers
  - [x] Validated: `helm lint`, kubeconform across 4 value sets, and a k3s smoke test (`deploy/scripts/k3s-smoke-test.sh`)
  - [ ] Verified on a real OpenShift cluster

---

## 📊 Summary of Phases & Milestone Roadmap

```text
Q4 2026 MILESTONES:
├── Phase 1 [Immediate]: Visual Topology Map, Traceroutes & Executive Summary Page
├── Phase 2 [Sprint 2]: Enterprise Incidents (INC-XXXX), Multi-Channel Notifications & ServiceNow
├── Phase 3 [Sprint 3]: Kafka Big Log Streaming, Log-Driven Auto-Discovery & Bulk Load Suites
└── Phase 4 [Sprint 4]: Decision Layer, Auto-Remediation & Kubernetes/OpenShift Pod Microservices
```
