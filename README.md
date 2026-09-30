# 🛰️ API Monitor: Universal Synthetic Monitoring & AIOps Platform

> **Universal Synthetic API Monitoring, Performance Testing & AIOps Platform**  
> Engineered with React 18, TypeScript, Tailwind CSS, Node.js Express, PostgreSQL 15, Redis 7, and Google Gemini AI Agent with autonomous tool calling.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Node.js Express](https://img.shields.io/badge/Node.js_Express-339933?style=flat-square&logo=node.js&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_15-316192?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis_7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![Docker Compose](https://img.shields.io/badge/Docker_Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Gemini AI](https://img.shields.io/badge/Google_Gemini-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)

---

## 📑 Table of Contents

- [Executive Overview](#-executive-overview)
- [System Architecture](#-system-architecture)
- [List of Delivered Features](#-list-of-delivered-features)
- [Manager Feedback Resolution Matrix](#-manager-feedback-resolution-matrix)
- [Technology Stack](#-technology-stack)
- [Quick Start & Deployment](#-quick-start--deployment)
  - [Prerequisites](#prerequisites)
  - [Option 1: Docker Compose Deployment (Recommended)](#option-1-docker-compose-deployment-recommended)
  - [Option 2: Local Development Setup](#option-2-local-development-setup)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [Inspecting Database & Cache](#-inspecting-database--cache)
- [Repository Structure](#-repository-structure)
- [Presentation & Review Companions](#-presentation--review-companions)
- [Phase 2 AIOps Roadmap](#-phase-2-aiops-roadmap)

---

## 🎯 Executive Overview

**API Monitor** is an enterprise-grade synthetic monitoring and operational decision platform. Designed to provide instant visibility into API health without requiring application-side SDK instrumentation, it provides:

- **Zero-touch Black-Box Synthetic Probing:** Continuously verifies endpoints across internal networks, microservices, and third-party APIs.
- **Bulk & Automated Discovery:** Seamlessly onboards APIs manually, via batch CSV upload, or through direct Swagger / OpenAPI v2 & v3 specification discovery.
- **On-Demand Performance Testing:** High-concurrency load testing engine computing real-time latency percentiles ($p50, p95, p99$) and throughput metrics.
- **Automated Root-Cause Classification:** Deterministic pattern recognition that identifies failures (Timeouts, DNS resolution, Connection Refusals, 5xx server faults) without manual log scraping.
- **AIOps Hybrid Assistant:** Google Gemini 3.8 Flash agent with multi-turn conversational memory, structured tool calling for operations, and a deterministic offline fallback engine.

---

## 🏗 System Architecture

### Component Architecture Diagram

![API Monitor System Architecture](rid/architecture-diagram.png)

### Logical Data Flow Diagram (ASCII)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER (Browser)                                    │
│  React 18 Dashboard (Port 8088) + React Query (15s Polling) + AIOps ChatWidget         │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │  HTTP /api/
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              REVERSE PROXY (Nginx :8088)                               │
│  Serves Static Frontend Bundle ──── Proxies API Requests to Backend                    │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │  Proxy to Port 4001
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         CORE BACKEND (Node.js Express :4001)                           │
│  Zod Schema Validation • Modular Express Controllers • REST Services                   │
│                                                                                        │
│  ┌───────────────────────┐  ┌─────────────────────────┐  ┌───────────────────────────┐ │
│  │ node-cron Scheduler   │  │ Load Testing Engine     │  │ Root Cause Classifier     │ │
│  │ (Parallel cron ticks) │  │ (Async worker pool,     │  │ (Regex & status matcher,  │ │
│  │                       │  │  p50/p95/p99 latency)   │  │  Timeout, DNS, 5xx, 4xx)  │ │
│  └───────────────────────┘  └─────────────────────────┘  └───────────────────────────┘ │
│                                                                                        │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│  │ Hybrid Operations Chat Engine:                                                    │ │
│  │ • Primary: Google Gemini 3.8 Flash with structured Tool Calling (chatTools.ts)    │ │
│  │ • Fallback: Deterministic Regex & SQL intent router (chat.service.ts)             │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────┬───────────────────────────┬───────────────────────────────┬─────────────┘
               │                           │                               │
               ▼                           ▼                               ▼
┌───────────────────────────────┐ ┌──────────────────────────────┐ ┌──────────────────────────┐
│     PostgreSQL Database       │ │         Redis Cache          │ │    Monitored Targets     │
│       (Host Port 5434)        │ │       (Host Port 6379)       │ │                          │
│ Time-series check persistence │ │ 30-second TTL summary cache  │ │ • External Public APIs   │
│ Immutable check history & SLA │ │ Fast dashboard aggregations  │ │ • Internal Microservices │
│ Endpoints & incident records  │ │ Reduced database contention  │ │ • Swagger/OpenAPI Specs  │
└───────────────────────────────┘ └──────────────────────────────┘ └──────────────────────────┘
```

---

## ✨ List of Delivered Features

### 1. 📊 Universal Real-Time Monitoring & Telemetry

- **15-Second Polling Beacon:** React Query auto-refreshes fleet metrics without jarring page reloads.
- **Fleet Health Breakdown:** Live distribution cards displaying Healthy ($2xx$), Degraded (slow response or flaky), and Down ($5xx$, timeouts, unreachable).
- **Latency & Availability Trends:** Interactive Recharts visualizer plotting response time trends, status code distributions, and percentiles.
- **Fastest & Slowest Rankings:** Instant leaderboards to isolate performance degradation across services.
- **Streak & SLA Tracking:** Consecutive uptime/downtime streak counters to differentiate transient blips from prolonged outages.

### 2. 🚀 Automated Onboarding & Swagger/OpenAPI Auto-Discovery

- **Interactive Manual Onboarding:** Add endpoints with custom HTTP methods (GET, POST, PUT, DELETE, PATCH), custom headers, authentication tokens, timeout thresholds, and check intervals.
- **CSV Bulk Import:** Bulk onboard dozens of endpoints with a single file upload with field mapping and validation.
- **OpenAPI / Swagger Auto-Discovery:** Input a Swagger URL (e.g., `petstore.swagger.io/v2/swagger.json`); the parser discovers all paths, extracts methods, parameters, and descriptions, and lets operators select and import endpoints with a single click.

### 3. ⚡ High-Concurrency API Load Testing Engine

- **Configurable Load Profiles:** Run concurrent bursts (e.g., 5 to 50 concurrent requests across 50 to 500 total iterations) against any registered endpoint.
- **Percentile Telemetry:** Computes real-time latency percentiles ($p50, p95, p99$), min/max/average latency, requests per second (RPS), and error rates.
- **SLA Isolation:** Load testing executions run in an isolated in-memory worker pool (`loadTest.service.ts`) without injecting synthetic check records into the historical database, preventing SLA report pollution.

### 4. 🔍 Automated Root-Cause Analysis (RCA)

- **Deterministic Pattern Matching:** Evaluates raw network error codes and status codes against an established heuristic matrix (`rootCause.service.ts`):
  - `Timeout`: Exceeded configured timeout window.
  - `DNS`: Hostname resolution failure (`ENOTFOUND`, `EAI_AGAIN`).
  - `Connection Refused`: Service daemon down or port closed (`ECONNREFUSED`).
  - `Server Error`: Internal server crashes or upstream gateway errors ($500, 502, 503, 504$).
  - `Client Error`: Authentication failures, forbidden paths, or bad requests ($400, 401, 403, 404$).
- **Postmortem-Ready Reporting:** Incident logs directly present the identified cause alongside the exact error snippet.

### 5. 🤖 Hybrid AIOps Chat Assistant with Operational Function Calling

- **Multi-Turn Context:** Retains conversational history across inquiries (e.g., _"Is MOMO API up?"_ followed by _"Run a check on it"_).
- **Autonomous Tool Calling:** Powered by Google Gemini 3.8 Flash using structured tool definitions (`chatTools.ts`):
  - `run_check`: Triggers an immediate synthetic check over the network.
  - `run_load_test`: Dispatches on-demand concurrent performance testing.
  - `create_endpoint`: Onboards a new service via plain conversation.
  - `set_endpoint_active`: Pauses or resumes monitoring schedules.
  - `update_endpoint`: Modifies timeout thresholds or check intervals.
- **Zero-Dependency Fallback:** If the external Gemini API is unconfigured, unreachable, or hits rate limits, the platform seamlessly falls back to an internal deterministic pattern engine (`chat.service.ts`). Zero crashes, zero token cost, and fully functional in air-gapped environments.

### 6. 📈 Multi-Tier Operational Reports

- **Daily 24-Hour Rollups:** Fleet availability, average response time, total requests executed, and failure counts.
- **Weekly 7-Day Performance:** Fastest, slowest, least stable, and top availability services side by side.
- **30-Day Executive Summary:** Total services monitored, overall fleet uptime percentage, total distinct incidents, and current degraded count.
- **Root-Cause Incident Log:** Chronological table of outages with resolved failure causes and clickable service drilldowns.

---

## 📋 Manager Feedback Resolution Matrix

This platform directly satisfies the feedback provided during the initial presentation review:

| #     | Feedback Point                                                 | Status                    | Implementation Details                                                                                                                                                                                                                                                |
| ----- | -------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **API performance testing engine, concurrent bulk requests**   | **Built**                 | Fully delivered via `loadTest.service.ts` and UI Load Test Modal. Provides concurrent worker pools, $p50/p95/p99$ percentiles, and RPS metrics. Accessible via UI and AI chat.                                                                                        |
| **2** | **Monitor internal tools, microservices, pods, observability** | **Operational / Roadmap** | **Operational:** Probes any internal microservice endpoint reachable over the network (e.g., internal VMS service).<br>**Roadmap:** Direct cluster pod metrics (CPU/Memory/CrashLoops) require OpenShift/K8s credentials (tracked in [rid/prd.md](rid/prd.md) §14.2). |
| **3** | **Auto-detection of errors + root cause analysis**             | **Built**                 | `rootCause.service.ts` auto-classifies network errors and status codes into Timeout, DNS, Connection Refused, and 5xx. Displayed on Dashboard and Reports views.                                                                                                      |
| **4** | **Auto-remediation (Human in the loop, then automate)**        | **Built (v1)**            | Conversational decision layer: The AI assistant triggers instant synthetic checks, launches load tests, pauses/resumes endpoints, and updates intervals upon human confirmation.                                                                                      |
| **5** | **Microservices in pods (OpenShift / Kubernetes)**             | **Architecture Ready**    | The system is fully containerized into discrete services (Nginx, Express, Postgres, Redis). Ready for Kubernetes/OpenShift Helm or pod deployment once cluster namespace access is provisioned.                                                                       |
| **6** | **Chatbots / AI agents**                                       | **Built (Hybrid)**        | Integrated floating `ChatWidget` with Gemini 3.8 Flash tool calling (`llmChatGemini.service.ts`) and deterministic local fallback (`chat.service.ts`).                                                                                                                |

---

## 💻 Technology Stack

| Layer              | Technologies                                        | Role in System                                                          |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------------------------- |
| **Frontend**       | React 18, TypeScript, Tailwind CSS v4, Lucide Icons | Responsive SPA, status indicators, and operational interface            |
| **State & Data**   | React Query (`@tanstack/react-query`), Axios        | 15s background polling, cache invalidation, and REST communication      |
| **Visualizations** | Recharts                                            | Dynamic response time area charts and health distribution donuts        |
| **API Gateway**    | Nginx (Alpine)                                      | Production static asset server & reverse proxy (`/api/*` $\to$ backend) |
| **Backend Core**   | Node.js, Express, TypeScript                        | Modular REST API service with Zod schema validation                     |
| **Scheduler**      | `node-cron`                                         | Asynchronous parallel scheduler for synthetic endpoint checks           |
| **Performance**    | Custom asynchronous worker pool                     | In-memory concurrent request dispatcher with percentile calculations    |
| **AI / AIOps**     | Google Gemini 3.8 Flash (`@google/genai`)           | Multi-turn reasoning with strict JSON schema tool calling               |
| **Persistence**    | PostgreSQL 15                                       | Time-series check storage, endpoints registry, and incident history     |
| **Caching**        | Redis 7 (Alpine)                                    | 30s TTL cache on dashboard summaries to protect database under load     |
| **Orchestration**  | Docker & Docker Compose                             | Multi-container reproducible runtime environment                        |

---

## 🚀 Quick Start & Deployment

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- [Git](https://git-scm.com/)
- _(Optional for local dev)_: Node.js 18+ and npm

---

### Option 1: Docker Compose Deployment (Recommended)

1. **Clone the repository:**

   ```bash
   git clone https://github.com/ridbay/API-Monitor.git
   cd API-Monitor
   ```

2. **Configure environment variables (Optional):**

   ```bash
   cp backend/.env.example backend/.env
   ```

   _(Optional: Add your `GEMINI_API_KEY` to `backend/.env`. If omitted, the AI assistant automatically runs in deterministic offline fallback mode)._

3. **Start the platform:**

   ```bash
   docker compose up -d --build
   ```

4. **Verify container health:**

   ```bash
   docker compose ps
   ```

5. **Access the platform:**
   - 🌐 **Web Dashboard:** [http://localhost:8088](http://localhost:8088)
   - ⚙️ **Backend REST API:** [http://localhost:4001](http://localhost:4001)
   - 🐘 **PostgreSQL Host Port:** `localhost:5434`
   - ⚡ **Redis Host Port:** `localhost:6379`

> **Note on Port Allocations:**
>
> - Frontend is mapped to **8088** on the host to avoid collisions with local Vite dev servers on port 5173.
> - PostgreSQL is mapped to **5434** on the host to prevent conflicts with local Postgres instances running on port 5432.

6. **View logs or stop services:**

   ```bash
   # Follow logs across all services
   docker compose logs -f

   # Follow backend logs specifically
   docker compose logs -f backend

   # Stop all services (data is preserved in docker volume)
   docker compose down
   ```

---

### Option 2: Local Development Setup

If running directly on the host machine without Docker:

#### 1. Start Postgres & Redis

Ensure PostgreSQL is running on port `5434` (or update `.env`) and Redis is running on port `6379`.

#### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
npm run migrate    # Runs database migrations to initialize tables
npm run dev        # Starts Express server on http://localhost:4001
```

#### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev        # Starts Vite dev server on http://localhost:5173
```

---

## ⚙️ Configuration & Environment Variables

The backend service is configured via `backend/.env`:

| Variable         | Default Value                                                | Description                                                                                 |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `PORT`           | `4001`                                                       | Port on which the Express API server listens                                                |
| `DATABASE_URL`   | `postgres://postgres:postgres@localhost:5434/api_monitoring` | PostgreSQL connection string                                                                |
| `REDIS_URL`      | `redis://localhost:6379`                                     | Redis connection URL for summary caching                                                    |
| `GEMINI_API_KEY` | _(Optional)_                                                 | Google AI Studio API Key for Gemini 3.8 Flash agent. If empty, runs deterministic fallback. |

---

## 🔍 Inspecting Database & Cache

To verify or audit raw metrics directly inside the Docker containers:

### Inspecting PostgreSQL

```bash
# Open interactive psql shell
docker compose exec postgres psql -U postgres -d api_monitoring

# Useful psql commands:
\dt                                                               # List all tables
SELECT id, name, url, method, interval_seconds FROM endpoints;    # View registered APIs
SELECT endpoint_id, status_code, response_time_ms, success, created_at
FROM monitoring_results ORDER BY created_at DESC LIMIT 10;        # View recent checks
\q                                                                # Exit
```

### Inspecting Redis Cache

```bash
# Open interactive redis-cli
docker compose exec redis redis-cli

# Check cached keys and dashboard summary
KEYS *
GET dashboard:summary
TTL dashboard:summary
```

---

## 📁 Repository Structure

```
.
├── docker-compose.yml          # Multi-container orchestration definition
├── README.md                   # Core project documentation
│
├── rid/                        # Project documentation & presentation resources
│   ├── DOCKER.md               # Docker operational and troubleshooting guide
│   ├── DEMO_WALKTHROUGH.md     # Comprehensive step-by-step presentation guide
│   ├── presentation-script.html# Interactive teleprompter presentation tool
│   ├── manager-feedback.md     # Feedback resolution tracking log
│   └── prd.md                  # Product Requirements & Phase 2 Architecture
│
├── backend/                    # Node.js + Express + TypeScript Backend
│   ├── src/
│   │   ├── controllers/        # REST route handlers (endpoints, checks, chat)
│   │   ├── services/
│   │   │   ├── check.service.ts        # Synthetic check execution
│   │   │   ├── loadTest.service.ts     # Concurrent performance testing engine
│   │   │   ├── rootCause.service.ts    # Deterministic RCA classifier
│   │   │   ├── llmChatGemini.service.ts# Gemini 3.8 Flash tool-calling agent
│   │   │   ├── chatTools.ts            # Declarative function-calling tool schemas
│   │   │   └── chat.service.ts         # Deterministic fallback chat engine
│   │   ├── cron/               # node-cron parallel scheduler
│   │   ├── db/                 # Postgres connection pool and migration scripts
│   │   └── routes/             # Express API router definitions
│   ├── Dockerfile
│   └── package.json
│
└── frontend/                   # React 18 + TypeScript + Tailwind CSS Frontend
    ├── src/
    │   ├── pages/              # Dashboard, Endpoints, Reports, Onboarding
    │   ├── components/         # Reusable UI cards, tables, charts, modals
    │   │   ├── ChatWidget.tsx          # Floating AIOps conversational assistant
    │   │   └── LoadTestModal.tsx       # Interactive performance test trigger
    │   ├── services/           # Axios API clients
    │   └── hooks/              # React Query custom hooks
    ├── nginx.conf              # Nginx reverse proxy configuration
    ├── Dockerfile
    └── package.json
```

---

## 🎤 Presentation & Review Companions

To assist with stakeholder presentations and technical code reviews, this repository includes dedicated presentation companions in the `rid/` directory:

1. **[rid/DEMO_WALKTHROUGH.md](rid/DEMO_WALKTHROUGH.md):**  
   A complete script featuring timing checkpoints, exact demonstration steps, talk tracks, and technical answers to architectural questions.
2. **[rid/presentation-script.html](rid/presentation-script.html):**  
   An interactive, keyboard-navigable (`←` / `→` / `Space`) live teleprompter with an integrated presentation timer designed for multi-monitor presenting.
3. **[rid/manager-feedback.md](rid/manager-feedback.md):**  
   The itemized resolution record showing where each request is implemented in the codebase.
4. **[rid/prd.md](rid/prd.md):**  
   The comprehensive Product Requirements Document and Phase 2 AIOps vision.
5. **[rid/DOCKER.md](rid/DOCKER.md):**  
   Detailed Docker commands, container lifecycles, database querying, and port collision notes.

---

## 🔮 Phase 2 AIOps Roadmap

The current implementation provides the core synthetic monitoring foundation and a v1 hybrid decision layer. Future planned milestones include:

- **Cluster & Pod Metrics Ingestion:** Direct integration with Kubernetes/OpenShift API and Prometheus to capture pod restarts, memory throttling, and container crash loops once cluster credentials are provisioned.
- **Proactive Latency Creep Anomaly Detection:** Rolling baseline calculations ($\mu \pm 3\sigma$) to flag degrading APIs before outages occur.
- **Multi-Channel Alert Dispatcher:** Native webhooks for Microsoft Teams, Slack, PagerDuty, and email with intelligent deduplication and incident suppression.
- **Autonomous Remediation (Closed-Loop):** Graduating from human-in-the-loop chat commands to autonomous mitigation actions (e.g., auto-restarting stalled pods or cycling connections).

---

## 📄 License & Attribution

Internal platform developed by **Ridwan Balogun** for API monitoring, observability, and performance automation. Built with open standards and zero external runtime licensing costs.
