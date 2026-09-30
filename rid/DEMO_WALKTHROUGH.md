# Universal Synthetic API Monitoring Platform
## Presenter Walkthrough & Conversational Talk-Track

- **Presenter:** Individual Contributor / Lead Engineer  
- **Audience:** Engineering Leadership / Manager, MTN Nigeria  
- **Target Time:** ~10–12 minutes  
- **Format:** Conversational, hands-on, live demonstration (First-person perspective)  
- **Stack:** React (Vite) + Tailwind CSS + Node.js (Express/TypeScript) + PostgreSQL + Redis + Docker Compose + Google Gemini 3.8 Flash  
- **Initial Setup:** Terminal open; Docker stack running on `http://localhost:8088`.

---

## Pre-Flight Technical Checklist (30 Seconds Before Demo)

Run these quick checks in your terminal to ensure everything is humming before you share your screen:

```bash
# 1. Verify all 4 containers are healthy and running
docker compose ps

# 2. Check that the frontend is accessible
curl -I http://localhost:8088

# 3. Quick test of the AI Assistant backend route
curl -s -X POST http://localhost:4001/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "What is down?"}' | grep "reply"
```

> **Pro Tip:** Keep a clean terminal tab open with `docker compose logs -f backend` hidden behind your browser. If your manager asks *"How do you know it actually pinged the network?"*, you can flick to that tab and show real-time cron check logs firing.

---

## 1. The Opening Hook (~90 Seconds)

> **CUE:** Hands completely off the keyboard. Look directly at your manager. Establish the real-world operational pain point before touching any UI.

"Before I touch the keyboard, quick context on the actual problem I set out to solve.

Right now, if someone wants to know whether an internal MTN service or a partner integration—like the MOMO API—is healthy, there’s no unified place to look. People either ping it manually from a terminal, write a quick throwaway curl script, or worst of all, find out it’s degraded when a customer or a dependent team calls in to complain. There's no shared history, no live dashboard, and no proactive warning that an API has been slipping for the past three days.

That's the exact gap this closes. It's an **automated synthetic monitoring and performance testing platform** I built. You register an endpoint once, and my background engine tests it continuously—every minute, every 15 minutes, or whatever schedule you decide. It records response times, tracks uptime percentages, captures HTTP status codes, classifies failure root causes, and surfaces everything onto a live dashboard.

And deployment is completely zero-friction: the entire stack—database, cache, API engine, background workers, and web interface—runs in **four lightweight Docker containers** brought up with a single command. Nothing proprietary to license, no cloud vendor lock-in, and nothing that needs its own infrastructure ticket.

Let me just show you live—it’s much faster than explaining it."

---

## 2. The 10-Beat Live Walkthrough Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Beat 01: Docker Zero-Friction Spin-up                                                  │
│ Beat 02: The Re-Architected Dashboard (Worst-First Triage & Performance Trends)        │
│ Beat 03: Register an Endpoint Live (Zero-Config Onboarding)                            │
│ Beat 04: Trigger an Instant Out-of-Band Synthetic Check (↻)                           │
│ Beat 05: Deep Telemetry & Time-Series History (24h / 7d / 30d)                         │
│ Beat 06: On-Demand API Load Testing Engine (p50 / p95 / p99 Percentiles)               │
│ Beat 07: Enterprise Scale Ingestion (OpenAPI / Swagger Discovery & CSV)                │
│ Beat 08: Live Fleet Sync & Internal Pod Observability Strategy                        │
│ Beat 09: Multi-Tier Reports & Automated Root-Cause Classification                     │
│ Beat 10: Interactive AI Operations Assistant & Decision Layer (Gemini Function Calls)  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Beat 01 · Zero-Friction Spin-Up

> **CUE:** Point at terminal (or run `docker compose up -d`).

"Before anything else—this is the entire deployment. 

Postgres for persistent time-series storage, Redis for telemetry caching, my Express API with the background parallel scheduler, and the Nginx frontend. Four containers, one command. That’s it. Nothing else to install anywhere on any server or internal VM that has Docker."

---

### Beat 02 · Land on the Dashboard (Worst-First Triage)

> **CUE:** Switch to browser and open `http://localhost:8088`.

"And here’s the dashboard. I've already got real MTN endpoints registered—the MOMO API, our visitor management system, GitHub, CoinCap, and others. I've had this running unattended, so this is genuinely what it looks like day-to-day, not a staged demo state.

Let me walk you through the controls:

1. **Live Beacon & Instant Sweep (Top Right):**  
   Notice that little green pulsing beacon in the top right—*Live • auto-refresh in 15s*. The dashboard continuously updates itself every 15 seconds. If a team just pushed a hotfix and wants to verify immediately, clicking **'Run all checks now'** sweeps across every single endpoint in parallel without waiting for the next timer.

2. **Executive Summary Cards (Top Row):**  
   Right at a glance: Total Endpoints (5), Healthy count, Failed count, and the global Average Response Time across all services.

3. **Quick Actions Bar:**  
   Directly underneath is the Quick Actions bar—one-click shortcuts to Add Endpoint, Import OpenAPI specs, or jump straight to SLA Reports without hunting through navigation menus.

4. **Macro vs. Micro: Health Distribution & Endpoint Health (Upper Grid):**  
   > **CUE:** Point at the donut chart on the left, then at the Endpoint Health list on the right.  
   I pair the macro view with the micro breakdown side-by-side:
   - On the left is the Health Distribution donut chart—healthy, warning, down.
   - On the right is **Endpoint Health**. I deliberately brought this right to the top because it sorts **worst-first**. Whatever is broken commands attention immediately. Look at MOMO right there at the top in red—it has been down, and the platform caught it unattended. It shows the exact streak—*Down for 13d 21h*—along with its availability percentage.
   - I also built interactive filter chips: clicking **'Issues'** instantly filters down to failing or degraded services, and the search bar filters services in real time when managing dozens of APIs.

5. **System Performance Trends (Area Chart):**  
   > **CUE:** Scroll down slightly to the Area Chart.  
   Below that is the **System Performance Trends** chart I built. It aggregates hourly performance across the entire network. I can flip the toggle to **Latency (ms)** to see if average response times are spiking, or switch to **Availability (%)** to spot dropouts, across **24 hours**, **7 days**, or a **30-day** rolling window.

6. **Recent Failures (Bottom Full-Width Log):**  
   > **CUE:** Scroll to the bottom table.  
   And down at the bottom is the audit log. Every failure captures the exact timestamp, status code, latency, and error details. Notice that last column: **Likely Cause**—I automatically classify the failure into Timeout, DNS resolution failure, Connection Refused, or Server 5xx. More on that in a minute."

---

### Beat 03 · Add One Endpoint Live

> **CUE:** Click `Endpoints` → `Add Endpoint` (or use the Quick Action shortcut).

"Let me add one live so you see how simple onboarding actually is.

Name, URL, how often to ping it—from every minute up to an hour—and what a healthy response status code looks like. Click Save. 

That’s the entire onboarding flow. No code changes, no configuration YAML files, no restart, and no deployment."

---

### Beat 04 · Trigger an Instant Out-of-Band Synthetic Check

> **CUE:** In the Endpoints table, click the `↻` icon next to the new endpoint row.

"It will check on its own in 60 seconds, but let’s not wait—I’ll just trigger it manually.

And there it is: status badge turns green, response time lands at 182 ms, and last checked updates to 'Just now'. In production, that loop happens silently in the background, every minute, for every service registered."

---

### Beat 05 · Endpoint Details & Granular Trends

> **CUE:** Click into any healthy endpoint (e.g. `MTN VMS` or `MOMO DEVELOPER`).

"This is where the system becomes invaluable over time. Every single check ever run against this endpoint gets stored in Postgres. So 'is this API slow?' or 'was it down last night?' stops being guesswork and becomes a graph you can actually point to.

You get:
- Response Time trendline over 24h, 7d, and 30d.
- Availability stacked bar chart showing green 'Up' vs red 'Down' intervals.
- Status Code Distribution chart showing the ratio of 200s, 400s, and 500s."

---

### Beat 06 · On-Demand API Load Testing Engine

> **CUE:** Scroll down to the **Load Test** section. Set concurrency to `5`, requests to `20`, and click **Run Load Test**.

"Now, right here at the bottom of the page is a direct answer to one of your key feedback points: **an API performance testing engine, not just a ping every minute**.

I can fire a burst of concurrent requests at this endpoint right now on demand.

Look at the results as they land:
- **Latency percentiles:** not just an average, but **p50, p95, and p99**. That matters because averages hide the slow tail—and p95 is where customer complaints actually come from.
- **Throughput:** requests per second (RPS) and error rate under load.

And here’s an important architectural design choice I made: **load test bursts are strictly isolated from synthetic uptime metrics**. A deliberate stress test should never penalize an API’s official SLA score on the dashboard."

---

### Beat 07 · Show It at Scale (OpenAPI Auto-Discovery)

> **CUE:** Click **Import** in the sidebar.

"Now, onboarding one endpoint is easy. But what happens when an engineering squad hands over a microservice with forty different routes?

Nobody wants to type forty rows into a web form. So I built two bulk onboarding methods:
1. Standard CSV import with a live preview and validation table.
2. **OpenAPI / Swagger Auto-Discovery:** point it at any team’s Swagger JSON URL, hit **Discover**, and every single route in the spec populates with checkboxes. Select the routes you care about, hit Import, and all forty are monitored in one click."

---

### Beat 08 · Back to the Dashboard — Live Sync & Internal Pod Observability

> **CUE:** Click **Dashboard** in the sidebar.

"Back on the dashboard: the newly discovered endpoints are already folded into the health distribution, the Endpoint Health list, and the performance trendlines. The dashboard picks up the changes automatically via React Query without a full page reload.

Now, I want to proactively address something I know you've been very keen on: **using this platform to monitor our internal tools, microservices, and pods running inside OpenShift and Kubernetes**.

Right now, this platform monitors any internal microservice endpoint that is reachable over the network—like our internal VMS service or any REST API running on an internal host. What I do **not** have access to right now is the actual OpenShift and Kubernetes cluster environments, namespace service accounts, and infrastructure APIs. Because of that access boundary, deep pod-level telemetry—such as tracking container restarts, CPU throttling, OOM kills, and crash loops—isn't hooked in today.

However, I've designed the ingestion pipeline and database architecture so that the moment cluster access and service account tokens are provisioned, we can plug in the Kubernetes API and Prometheus scraper seamlessly as a Phase 2 integration without having to rebuild the platform."

---

### Beat 09 · Examine Reports & Root-Cause Classification

> **CUE:** Click **Reports** in the sidebar.

"Next stop is Reports, which I split into three operational tiers:
1. **Daily View:** Checks run today, overall uptime percentage, incident count, and today’s outage breakdown.
2. **Weekly View:** Four comparative rankings side by side—Fastest, Slowest, Least Stable, and Best Availability. This gives clear visibility into which services need architectural attention.
3. **Monthly 30-Day Rollup:** High-level metrics for management: total services tracked, system-wide uptime, total incidents, and degraded endpoints.

> **CUE:** Scroll down to the Outages table and point to the **Likely Cause** column.

And look right here: **Automated Root-Cause Classification**.

Instead of someone reading an obscure stack trace or raw network string, every failure gets classified into:
- `Timeout` (no response within configured window)
- `DNS` (hostname failed to resolve)
- `Connection Refused` (service down or port closed)
- `Server Error` (5xx backend crash)
- `Client Error` (4xx bad request / auth issue)

It's deterministic pattern analysis against network errors and status codes—giving engineers an immediate diagnostic direction before they even open a ticket."

---

### Beat 10 · Ask the Assistant — AI Agent & Interactive Operations Chatbot

> **CUE:** Click the **floating bot icon** in the bottom-right corner of the screen.

"And finally—this directly answers two major points from your feedback: *'Add chatbots / AI agents'* and *'Decision layer (Human in the loop, then automate)'*. I built an interactive AI operational assistant directly into the bottom corner of every page.

Let me show you how this is different from a simple search box:

1. **Natural Language Telemetry Queries:**
   > **CUE:** Click the **'What\'s down?'** suggestion chip or type it in.  
   You don't have to navigate dashboards to triage incidents. Ask:
   - *'What’s down?'*
   - *'Slowest APIs this week'*
   - *'Give me a fleet summary'*  
   It queries the database in real time, lists the affected services, their current downtime streak, and provides direct clickable links to the endpoint details.

2. **Multi-Turn Context & Autonomous Tool Actions (Human-in-the-Loop Decision Layer):**
   > **CUE:** Type: *'Is MOMO up?'* wait for reply, then type: *'Run a check on it'*.  
   Notice that it understands follow-ups. When I ask *'Is MOMO up?'*, it checks the status. When I follow up with *'Run a check on it'*, the assistant recognizes 'it' refers to MOMO, invokes the backend **function-calling tool** I built, executes an immediate synthetic check over the network, and reports the live response time and status code right in the chat.
   
   I gave it real operational tools:
   - Trigger instant checks (`run_check`)
   - Trigger concurrent load tests (`run_load_test`)
   - Onboard new services via conversation (`create_endpoint`)
   - Pause or resume monitoring schedules (`set_endpoint_active`)
   - Update endpoint timeouts and intervals (`update_endpoint`)

3. **Hybrid Architecture (Zero Hallucinations & Resilient Fallback):**  
   I engineered this with a resilient dual-engine architecture:
   - **Google Gemini 3.8 Flash Agent:** When configured with an API key, it acts as an autonomous function-calling agent strictly constrained by system instructions to execute tools without hallucinating false data.
   - **Deterministic Fallback Engine:** If an external LLM API is unavailable, unconfigured, or hits quota limits, the backend automatically falls back to my local, pattern-matched engine (`chat.service.ts`). It has zero external dependencies, zero token costs, and never breaks down in isolated internal network environments."

---

## 3. Under the Hood (~2 Minutes)

"For anyone curious about how I actually engineered this:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Nginx :8088)                                    │
│  React 18 + TypeScript + Tailwind CSS v4 + Recharts + React Query (15s Polling Beacon) │
│  Global Floating AI ChatWidget with Multi-Turn Memory & Suggestion Pills               │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │  REST API calls (/api/*)
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               BACKEND (Node.js :4001)                                  │
│  Express + TypeScript + Zod Runtime Schema Validation                                  │
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
└───────────────────────────┬───────────────────────────────┬────────────────────────────┘
                            │                               │
                            ▼                               ▼
       ┌───────────────────────────────┐       ┌──────────────────────────────┐
       │     PostgreSQL Database       │       │         Redis Cache          │
       │ Time-series check persistence │       │ 30-second TTL summary cache  │
       │ Immutable check history & SLA │       │ Fast dashboard aggregations  │
       └───────────────────────────────┘       └──────────────────────────────┘
```

- **Frontend:** Built with React, TypeScript, Tailwind CSS, and Recharts. Live telemetry is managed by React Query with a 15-second polling loop and intelligent cache invalidation. A global floating `ChatWidget` is accessible across all views.
- **Backend:** Node.js Express in TypeScript with strict Zod validation on every route.
- **Scheduler:** A parallel `node-cron` worker that evaluates intervals and fires checks simultaneously—it runs the exact same loop whether monitoring 5 endpoints or 500.
- **Performance Engine:** `loadTest.service.ts` uses an asynchronous worker pool to execute concurrent bursts and calculate statistical percentiles (p50, p95, p99).
- **Root-Cause Service:** `rootCause.service.ts` uses deterministic regex pattern matching against network error strings and HTTP status codes.
- **AI Agent & Chat Engine:** 
  - `llmChatGemini.service.ts` leverages Gemini 3.8 Flash with structured tool schemas (`chatTools.ts`) for multi-turn conversation and autonomous operations.
  - `chat.service.ts` provides a deterministic keyword and intent router for seamless zero-dependency local fallback.
- **Database & Cache:** PostgreSQL for time-series persistence (every single check is an immutable row), fronted by Redis caching summary stats for 30 seconds so frequent dashboard reloads never degrade database performance."

---

## 4. Response Matrix to Manager Feedback

Here is how every single item from your feedback session is addressed:

| # | Manager Feedback Point | Platform Status | How I Handled It in the Demo |
|---|---|---|---|
| **1** | **API performance testing engine, concurrent bulk requests** | **Built (v1)** | Demonstrated live on Endpoint Details with p50, p95, p99 percentiles and RPS metrics; can also be triggered via AI Chat. |
| **2** | **Auto root-cause analysis** | **Built (v1)** | Demonstrated on Dashboard Recent Failures and Daily Reports (Timeout, DNS, Connection Refused, 5xx). |
| **3** | **Chatbots / AI agents** | **Built (v1 Hybrid)** | Live floating assistant on every page powered by Gemini 3.8 Flash function-calling tools with deterministic local fallback. |
| **4** | **Decision layer (Human in the loop, then automate)** | **Built (v1)** | Chat assistant can trigger checks, load tests, endpoint onboarding, and pause/resume actions upon human conversational command. |
| **5** | **Proactive anomaly & degradation detection** | **Phase 2.1 Roadmap** | Statistical baseline tracking (moving average + std dev) to alert on latency creep before an outage occurs. |
| **6** | **Multi-channel alerting & incident grouping** | **Phase 2.2 Roadmap** | Webhook integration (Slack / Teams / Email) with deduplication so 10 failed pings = 1 incident. |
| **7** | **Monitor internal tools, pods, microservices (OpenShift/K8s)** | **Roadmap (Phase 2)** | Proactively stated: I currently do not have OpenShift/Kubernetes cluster access. HTTP microservices are monitored today, and direct pod/cluster integration will be added in Phase 2 once access is provisioned. |

---

## 5. Presenter Cheat Sheet: Handling Tough Questions

Here are ready answers for the 5 most likely engineering and architectural questions:

### Q1: "What happens if Gemini runs out of API quota, or the network drops?"
> **Answer:** "I built the system as a resilient hybrid. In `chat.controller.ts`, if the Gemini API key is missing, hits rate limits, or an external API error occurs, I catch the error and immediately fall back to my local, pattern-matched engine (`chat.service.ts`). You experience zero crash, zero 500 error, and still get accurate telemetry directly from PostgreSQL."

### Q2: "Can this monitor our internal tools, pods, and microservices in OpenShift and Kubernetes?"
> **Answer:** "Right now, it monitors any internal microservice endpoint that exposes an HTTP/REST interface reachable over the network (like our internal VMS service). However, for direct pod-level observability—such as monitoring container restarts, CPU throttling, or OOM crash loops inside OpenShift and Kubernetes—I do not have access to the cluster environments or service account credentials yet. I've designed the ingestion architecture so that once cluster access is granted, we can easily do that integration in Phase 2 without changing the core platform."

### Q3: "Does running an on-demand load test skew our official uptime or SLA reports?"
> **Answer:** "No, I deliberately designed an architectural boundary between them. Scheduled synthetic checks write to the `checks` table, which drives the SLA and uptime metrics. On-demand load tests execute in `loadTest.service.ts` in memory and return directly to the caller without inserting synthetic check rows into the database."

### Q4: "How does this platform scale when we add hundreds of endpoints?"
> **Answer:** "I designed the cron worker to query for endpoints due for checks and dispatch them concurrently using an asynchronous worker pool. On the query side, I fronted dashboard aggregations with Redis with a 30-second TTL. Even if 50 engineers have the dashboard open with 15-second polling, Postgres only sees one aggregate query every 30 seconds."

### Q5: "Why not just use Datadog, Dynatrace, or Prometheus?"
> **Answer:** "Those are excellent APM tools for deep code profiling and host metrics, but they have major gaps: they are expensive per host, require agent installations inside production code, and don't provide external synthetic black-box verification. I built this platform to give us an internal, zero-license, black-box synthetic monitoring layer that tests our endpoints exactly how our customers and partner apps experience them."

---

## 6. The Closing Punchline (~30 Seconds)

> **CUE:** Close your laptop or turn back to your manager.

"To sum it up: **Add an API once, and I am tracking its availability, latency, load capacity, root causes, and autonomous operations forever.** 

What questions can I answer for you?"
