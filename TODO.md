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
| **1** | Concurrent Bulk Performance Testing | Multi-endpoint load generator with configurable curves ($p50, p95, p99$) | High | 🟡 Partial (`loadTest.service.ts`) |
| **2** | Pods & Microservices Observability | Kubernetes API daemon watching pod states, restarts, OOMKilled, limits | High | ⚪ Pending cluster credentials |
| **3** | Auto-Detect Endpoints & Pods from Logs | Access log harvesting engine parsing URIs, normalizer & auto-catalog | High | ⚪ Planned (Phase 3) |
| **4** | Kafka Big Log Pipeline $\to$ PostgreSQL | Apache Kafka broker, consumer worker pool, partitioned PostgreSQL tables | High | ⚪ Planned (Phase 3) |
| **5** | **Topology Functionalities** | **Interactive service dependency graph with dynamic health & blast radius** | **CRITICAL** | ⚪ Planned (Phase 1) |
| **6** | Network Traceroutes | Hop-by-hop latency and packet loss diagnostic visualizer | High | ⚪ Planned (Phase 1) |
| **7** | Unique Reference Incident Management | Incident state engine (`INC-YYYYMMDD-XXXX`), timeline, SLA tracking | High | ⚪ Planned (Phase 2) |
| **8** | Multi-Channel Notifications & ServiceNow | Email lists, SMS gateways (Twilio/SMPP), two-way ServiceNow Table API | High | ⚪ Planned (Phase 2) |
| **9** | RCA & Recommendation Engine | Correlative root cause engine + prescriptive actionable runbooks | High | 🟡 Partial (`rootCause.service.ts`) |
| **10** | Decision Layer & Auto-Remediation | Approval gate (Human-in-the-Loop) + K8s action runner (pod restart, scale) | High | 🟡 v1 Chat Tools |
| **11** | OpenShift/Kubernetes Deployment | Microservices containerized in pods, Helm charts, OpenShift Routes | High | 🟡 Docker Compose ready |
| **12** | Chatbots / AI Operations Agent | Gemini 3.8 Flash agent with incident summary & remediation tool calling | High | 🟢 Operational (Hybrid) |
| **13** | Executive Summary Page | C-level KPI dashboard: fleet SLA % vs target, MTTD, MTTR, domain health | High | ⚪ Planned (Phase 1) |

---

## 🚀 Phased Implementation Checklist

---

### Phase 1: Real-Time Topology Engine, Traceroutes & Executive Summary Page
> **Focus:** Deliver the most visually impactful and critical items flagged by leadership.

#### 1.1 Service Topology Graph (EXTREMELY CRITICAL)
- [ ] Install topology visualization engine (`@xyflow/react` / React Flow or VisNetwork)
- [ ] Create Topology Page (`frontend/src/pages/Topology.tsx`) and navigation link
- [ ] Define Topology Data Model:
  - [ ] Service Nodes: Microservices, Ingress Routers, Pods, Databases (PostgreSQL, Redis), 3rd-party APIs
  - [ ] Dependency Edges: Traffic direction, live RPS throughput, latency ($ms$), error rate ($0\%$)
- [ ] Dynamic Health Color Coding:
  - [ ] 🟢 Healthy (SLA $>99\%$, $p95 < 200\text{ms}$, 0 errors)
  - [ ] 🟡 Degraded (Latency spikes, packet loss $>2\%$)
  - [ ] 🔴 Outage (Pod CrashLoop, 5xx server errors, connection refused)
- [ ] Interactive Blast Radius Inspector:
  - [ ] Click node to highlight upstream callers and downstream dependencies
  - [ ] Quick drilldown drawer showing active incidents, endpoints, and pod logs
- [ ] Backend Topology Service (`backend/src/services/topology.service.ts`):
  - [ ] Discover and infer dependency edges from traffic logs and synthetic targets
  - [ ] Cache topology graph in Redis (`topology:graph:current`)

#### 1.2 Network Traceroutes & Path Diagnostics
- [ ] Create Traceroute Service (`backend/src/services/traceroute.service.ts`):
  - [ ] Hop-by-hop network probe (ICMP / TCP ping / DNS lookup)
  - [ ] Identify gateway bottlenecks, firewall drops, ISP latency, target server delays
- [ ] Visual Traceroute Timeline Component (`frontend/src/components/TracerouteModal.tsx`):
  - [ ] Visual hop cards with latency per hop, IP address, resolved ASN/host, status
- [ ] Integrated diagnostic action on Endpoint Details page and Incident drilldowns

#### 1.3 Executive Summary Page
- [ ] Create Executive Dashboard Page (`frontend/src/pages/ExecutiveSummary.tsx`)
- [ ] High-Level Leadership KPI Scorecards:
  - [ ] Overall Fleet Availability vs SLA Commitment ($99.94\%$ vs $99.90\%$ Target)
  - [ ] Mean Time to Detect (MTTD)
  - [ ] Mean Time to Resolve (MTTR)
  - [ ] Total Incidents Avoided / Auto-Remediated
  - [ ] Critical Business Impact / Financial Risk exposure
- [ ] Business Domain Grouping:
  - [ ] Health status cards grouped by department/line-of-business (e.g. Core Network, Billing, Customer Portal, Momo)
- [ ] Incident Volume & SLA Trends (Recharts visualizer)
- [ ] Exportable Executive Briefing (Print/PDF ready layout)

---

### Phase 2: Enterprise Incidents, Multi-Channel Notifications & ServiceNow
> **Focus:** Full operational incident governance and enterprise communication.

#### 2.1 Enterprise Incident Lifecycle & Unique References
- [ ] Upgrade Incident Model with Unique References:
  - [ ] Reference scheme: `INC-YYYYMMDD-XXXX` (e.g. `INC-202610-0042`)
- [ ] Incident State Machine:
  - [ ] `TRIGGERED` $\to$ `ACKNOWLEDGED` $\to$ `INVESTIGATING` $\to$ `MITIGATED` $\to$ `RESOLVED` $\to$ `CLOSED`
- [ ] Incident Timeline & Postmortem Trail:
  - [ ] Correlated event timeline: Check failures, pod logs, traceroutes, remediation attempts
  - [ ] Affected endpoints, microservices, and estimated blast radius
- [ ] Incidents Management Console UI (`frontend/src/pages/Incidents.tsx`)

#### 2.2 Multi-Channel Notification Engine
- [ ] Notification Dispatcher Service (`backend/src/services/notification.service.ts`):
  - [ ] Rule-based notification policies (Severity P1/P2/P3/P4, quiet hours, escalation timers)
  - [ ] Anti-flapping & alert deduplication (suppress duplicate notifications within alert window)
- [ ] Email Dispatcher:
  - [ ] SMTP / SES integration
  - [ ] Formatted HTML incident digests for individual engineers and group mailing distribution lists
- [ ] SMS Gateway:
  - [ ] Twilio / SMPP gateway integration for emergency P1 on-call alerting
- [ ] Slack / Teams Webhook Integration

#### 2.3 ServiceNow Incident Integration
- [ ] ServiceNow Client (`backend/src/services/serviceNow.service.ts`):
  - [ ] ServiceNow Table API integration (`POST /api/now/table/incident`)
  - [ ] Map platform incidents to ServiceNow fields (Short Description, Caller, Category, Impact, Urgency)
  - [ ] Store external ServiceNow ticket reference (`sys_id`, `number` e.g. `INC0019283`)
  - [ ] Bi-directional sync: Update ticket status when incident resolves in API Monitor

---

### Phase 3: Kafka Log Ingestion, Big Logs Pipeline & Auto-Discovery
> **Focus:** High-throughput streaming log ingestion and zero-touch auto-discovery.

#### 3.1 Apache Kafka Event Streaming Infrastructure
- [ ] Add Apache Kafka & Zookeeper / KRaft to `docker-compose.yml` and Helm charts
- [ ] Define Core Kafka Topics:
  - [ ] `telemetry.raw-logs` (High-volume application & access logs)
  - [ ] `telemetry.access-logs` (Parsed ingress/router HTTP requests)
  - [ ] `telemetry.events` (State changes, alerts, auto-discovery events)
- [ ] Kafka Producer / Log Shipper Configuration:
  - [ ] Fluentbit / Promtail daemonset forwarding container logs to Kafka

#### 3.2 Kafka Consumer & PostgreSQL Big Data Storage
- [ ] Kafka Consumer Microservice (`backend/src/services/kafkaConsumer.service.ts`):
  - [ ] Batch consumer group with configurable concurrency and backpressure
  - [ ] High-throughput batch insert into PostgreSQL
- [ ] PostgreSQL Schema Optimization:
  - [ ] Time-series table partitioning (`access_logs_y2026m10`) or TimescaleDB hypertable
  - [ ] Retention policies & automated pruning for big logs

#### 3.3 Auto-Detect Endpoints, Pods & Services from Logs (Auto-Add)
- [ ] Access Log Pattern Parser:
  - [ ] Extract HTTP method, path, status, latency, upstream pod, service name
- [ ] Route Regex Normalizer:
  - [ ] Parameterize dynamic IDs (e.g. `/api/v1/users/49102` $\to$ `/api/v1/users/:id`)
- [ ] Auto-Catalog Engine:
  - [ ] Detect previously unseen endpoints and microservices
  - [ ] Auto-register in database with tag `SOURCE_LOG_DISCOVERED`
  - [ ] Schedule baseline synthetic health verification automatically
- [ ] Discovery Review Console in UI:
  - [ ] View newly discovered endpoints from logs with 1-click promotion to critical monitoring

#### 3.4 Multi-Endpoint Concurrent Performance Testing Suite
- [ ] Expand `loadTest.service.ts` to support multi-endpoint scenario suites
- [ ] Configurable test profiles: Concurrent users, ramp-up time, test duration, RPS limits
- [ ] Real-time execution telemetry: Throughput graphs, error rate %, latency percentiles ($p50, p90, p95, p99$)
- [ ] Dedicated worker pool to isolate load generation from core API monitoring

---

### Phase 4: Decision Layer, Auto-Remediation & Kubernetes/OpenShift Deployment
> **Focus:** Close the loop with intelligent recommendations, human approval, and cluster deployment.

#### 4.1 Prescriptive RCA & Recommendation Engine
- [ ] Multi-signal RCA correlator (`backend/src/services/rcaEngine.service.ts`):
  - [ ] Cross-reference synthetic 5xx errors with pod restart events, OOMKilled errors, and DB connection metrics
  - [ ] Generate structured root-cause diagnosis
- [ ] Prescriptive Recommendation Generator:
  - [ ] Propose concrete, executable runbooks (e.g. `Restart Pod payment-v2`, `Scale deployment to 4 replicas`, `Purge Redis cache key`)

#### 4.2 Decision Layer & Auto-Remediation Engine
- [ ] Human-in-the-Loop Approval Workflow:
  - [ ] When failure occurs, generate Remediation Plan with unique ID (`REC-XXXX`)
  - [ ] Present Approval Card in UI, AI Chatbot, and ServiceNow ticket
  - [ ] Require Operator confirmation before executing destructive/infrastructure changes
- [ ] Action Execution Runners:
  - [ ] Kubernetes API Action Runner (`@kubernetes/client-node`):
    - [ ] `rolloutRestartDeployment(namespace, name)`
    - [ ] `scaleDeployment(namespace, name, replicas)`
    - [ ] `deleteFailedPod(namespace, podName)`
  - [ ] Cache & Network Action Runners: Flush cache, toggle circuit breaker
- [ ] Verification & Audit Trail:
  - [ ] Re-probe endpoint post-remediation to verify recovery
  - [ ] Log full audit record: Triggering incident, proposed action, approver identity, execution result
- [ ] Auto-Pilot Toggle:
  - [ ] Allow administrators to mark verified low-risk runbooks as `AUTOPILOT` (zero-touch automated execution)

#### 4.3 Chatbot & AI Assistant Expansion
- [ ] Integrate new tool definitions in `backend/src/services/chatTools.ts`:
  - [ ] `get_incident_details`: Retrieve incident history and RCA by unique ID (`INC-XXXX`)
  - [ ] `get_service_topology`: Query upstream/downstream dependencies for a service
  - [ ] `approve_remediation`: Conversational approval of pending remediation runbooks
  - [ ] `run_traceroute`: Dispatch network hop diagnostics on demand
- [ ] UI enhancements in `frontend/src/components/ChatWidget.tsx` for visual action cards

#### 4.4 Microservices Architecture & OpenShift/Kubernetes Deployment
- [ ] Decouple monolithic backend into microservice container images:
  - [ ] `api-gateway` (Nginx / OpenShift Router)
  - [ ] `frontend-dashboard` (React static build)
  - [ ] `core-api-bff` (BFF & CRUD management)
  - [ ] `kafka-log-consumer` (High-volume log ingestion & endpoint harvester)
  - [ ] `synthetics-engine` (Probes & traceroutes)
  - [ ] `perf-worker` (Concurrent load generator)
  - [ ] `remediation-engine` (RCA, decision gate, K8s action runner)
  - [ ] `notification-service` (ServiceNow, SMS, Email dispatcher)
- [ ] Kubernetes & OpenShift Manifests / Helm Chart:
  - [ ] Deployments, Services, ConfigMaps, Secrets
  - [ ] OpenShift Routes & Ingress Controllers
  - [ ] ServiceAccount with RBAC permissions to inspect and manage pods in target namespaces
  - [ ] Resource requests & limits, liveness & readiness probes

---

## 📊 Summary of Phases & Milestone Roadmap

```text
Q4 2026 MILESTONES:
├── Phase 1 [Immediate]: Visual Topology Map, Traceroutes & Executive Summary Page
├── Phase 2 [Sprint 2]: Enterprise Incidents (INC-XXXX), Multi-Channel Notifications & ServiceNow
├── Phase 3 [Sprint 3]: Kafka Big Log Streaming, Log-Driven Auto-Discovery & Bulk Load Suites
└── Phase 4 [Sprint 4]: Decision Layer, Auto-Remediation & Kubernetes/OpenShift Pod Microservices
```
