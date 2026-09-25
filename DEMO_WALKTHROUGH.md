# Universal Synthetic API Monitoring Platform
## Presenter Walkthrough & Conversational Talk-Track

- **Audience:** Engineering Leadership / Manager, MTN Nigeria  
- **Target Time:** ~11–12 minutes  
- **Format:** Conversational, hands-on demo flow  
- **Initial State:** Terminal open; Docker containers stopped (`docker compose down`).

---

## 1. The Opening (~90 Seconds)

> **CUE:** Hands off the keyboard. Look directly at your manager. Set the stakes before showing code or UI.

"Before I touch the keyboard, quick context on the actual headache this solves for us.

Right now, if someone on our team wants to know whether an internal MTN service or a partner integration—like the MOMO API—is healthy, there’s no unified place to look. We either ping it manually from a terminal, write a quick throwaway script, or worst of all, we find out it’s degraded when a customer or dependent team calls in to complain. There's no shared history, no live dashboard, and no proactive warning that an API has been slipping for the past three days.

That's the exact gap this closes. It's an **automated synthetic monitoring platform**. You register an endpoint once, and our background engine tests it continuously—every minute, every 15 minutes, or whatever schedule you decide. It records response times, tracks uptime percentages, captures HTTP status codes, and surfaces everything onto a live dashboard.

And deployment is completely zero-friction: the entire stack—database, cache, API engine, and web interface—runs in **four lightweight Docker containers** brought up with a single command. Nothing proprietary to license, no cloud dependencies, and nothing that needs its own infrastructure ticket.

Let me just show you live—it’s much faster than explaining it."

---

## 2. The 10-Beat Live Walkthrough

```
┌────────────────────────────────────────────────────────────────────────┐
│  Beat 01: Docker Up → Beat 02: Dashboard & Telemetry → Beat 03: Add API│
│  Beat 04: Check ↻   → Beat 05: Detail & Latency Trends → Beat 06: Load │
│  Beat 07: OpenAPI 40x → Beat 08: Live Sync → Beat 09: Root Cause Reports│
│  Beat 10: Interactive Ops Chatbot Assistant                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Beat 01 · Bring Up the Whole Stack

> **CUE:** In terminal: `docker compose up -d`

"Before anything else—this is the entire deployment. 

Postgres, Redis, our Express API with the background scheduler, and the Nginx frontend. Four containers, one command. That’s it. Nothing else to install anywhere on any server or VM that has Docker."

---

### Beat 02 · Land on the Dashboard

> **CUE:** Switch to browser and open `http://localhost:8088`.

"And here’s the dashboard. I've already got a few real MTN endpoints registered—the MOMO API, our visitor management system, GitHub, CoinCap, and a couple more. This has been running unattended, so this is genuinely what it looks like day-to-day, not a staged demo state.

Let me walk you through the controls:

1. **Live Beacon & Telemetry (Top Right):**  
   Notice that little green pulsing beacon in the top right—*Live • auto-refresh in 15s*. The dashboard continuously updates itself every 15 seconds. If a team just pushed a hotfix and wants to verify immediately, clicking **'Run all checks now'** sweeps across every single endpoint in parallel without waiting for the next timer.

2. **Executive Summary Cards (Top Row):**  
   Right at a glance: Total Endpoints (5), Healthy count, Failed count, and our global Average Response Time across all services.

3. **Quick Actions Bar:**  
   Directly underneath is our Quick Actions bar—one-click shortcuts to Add Endpoint, Import OpenAPI specs, or jump straight to SLA Reports without hunting through navigation menus.

4. **Health Distribution & Endpoint Health (Upper Grid):**  
   > **CUE:** Point at the pie chart on the left, then at the Endpoint Health list on the right.  
   We pair the macro view with the micro breakdown:
   - On the left is our Health Distribution donut chart—healthy, warning, down.
   - On the right is **Endpoint Health**. We deliberately brought this right to the top because it sorts **worst-first**. Whatever is broken floats straight to the top. Look at MOMO sandbox right there in red—it has been down for days, and the platform caught it unattended. It shows the exact streak—*Down for 8d 20h*—along with its availability percentage.
   - We also have interactive filter chips: clicking **'Issues'** instantly filters down to failing or degraded services, and the search bar filters services in real time when you're managing dozens of APIs.

5. **System Performance Trends (Area Chart):**  
   > **CUE:** Scroll down slightly to the Area Chart.  
   Below that is our **System Performance Trends** chart. It aggregates hourly performance across the entire network. I can flip the toggle to **Latency (ms)** to see if average response times are spiking, or switch to **Availability (%)** to spot dropouts, across **24 hours**, **7 days**, or a **30-day** rolling window.

6. **Recent Failures (Bottom Full-Width Log):**  
   > **CUE:** Scroll to the bottom table.  
   And down at the bottom is our audit log. Every failure captures the exact timestamp, status code, and error details. Notice that last column: **Likely Cause**—we automatically classify the failure into Timeout, DNS resolution failure, Connection Refused, or Server 5xx. More on that in a minute."

---

### Beat 03 · Add One Endpoint Live

> **CUE:** Click `Endpoints` → `Add Endpoint` (or use the Quick Action shortcut).

"Let's add one live so you see how simple onboarding actually is.

Name, URL, how often to ping it—from every minute up to an hour—and what a healthy response status code looks like. Click Save. 

That’s the entire onboarding flow. No code changes, no configuration YAML files, no restart, and no deployment."

---

### Beat 04 · Trigger an Instant Check

> **CUE:** In the Endpoints table, click the `↻` icon next to the new endpoint row.

"It will check on its own in 60 seconds, but let’s not wait—I’ll just trigger it manually.

And there it is: status badge turns green, response time lands at 182 ms, and last checked updates to 'Just now'. In production, that loop happens silently in the background, every minute, for every service you’ve registered."

---

### Beat 05 · Endpoint Details & Granular Trends

> **CUE:** Click into any healthy endpoint (e.g. `MTN VMS` or `MOMO DEVELOPER`).

"This is where the system becomes invaluable over time. Every single check ever run against this endpoint gets stored in Postgres. So 'is this API slow?' or 'was it down last night?' stops being guesswork and becomes a graph you can actually point to.

You get:
- Response Time trendline over 24h, 7d, and 30d.
- Availability stacked bar chart showing green 'Up' vs red 'Down' intervals.
- Status Code Distribution chart showing the ratio of 200s, 400s, and 500s."

---

### Beat 06 · On-Demand Load Testing Engine

> **CUE:** Scroll down to the **Load Test** section. Set concurrency to `5`, requests to `20`, and click **Run Load Test**.

"Now, right here at the bottom of the page is a direct answer to one of your key feedback points: **an API performance testing engine, not just a ping every minute**.

I can fire a burst of concurrent requests at this endpoint right now on demand.

Look at the results as they land:
- **Latency percentiles:** not just an average, but **p50, p95, and p99**. That matters because averages hide the slow tail—and p95 is where customer complaints actually come from.
- **Throughput:** requests per second (RPS) and error rate under load.

And here’s an important architectural design choice: **load test bursts are strictly isolated from synthetic uptime metrics**. A deliberate stress test should never penalize an API’s official SLA score on the dashboard."

---

### Beat 07 · Show It at Scale (OpenAPI Auto-Discovery)

> **CUE:** Click **Import** in the sidebar.

"Now, onboarding one endpoint is easy. But what happens when an engineering squad hands us a microservice with forty different routes?

Nobody wants to type forty rows into a web form. So we built two bulk onboarding methods:
1. Standard CSV import with a live preview.
2. **OpenAPI / Swagger Auto-Discovery:** point it at any team’s Swagger JSON URL, hit **Discover**, and every single route in the spec populates with checkboxes. Select the routes you care about, hit Import, and all forty are monitored in one click."

---

### Beat 08 · Back to the Dashboard — Live Synchronization

> **CUE:** Click **Dashboard** in the sidebar.

"Back on the dashboard: the newly discovered endpoints are already folded into our health distribution, our Endpoint Health list, and our performance trendlines. The dashboard picks up the changes automatically via React Query without a full page reload."

---

### Beat 09 · Examine Reports & Root-Cause Classification

> **CUE:** Click **Reports** in the sidebar.

"Next stop is Reports, split into three operational tiers:
1. **Daily View:** Checks run today, overall uptime percentage, incident count, and today’s outage breakdown.
2. **Weekly View:** Four comparative rankings side by side—Fastest, Slowest, Least Stable, and Best Availability. This gives teams clear visibility into which services need architectural attention.
3. **Monthly 30-Day Rollup:** High-level metrics for management: total services tracked, system-wide uptime, total incidents, and degraded endpoints.

> **CUE:** Scroll down to the Outages table and point to the **Likely Cause** column.

And look right here: **Automated Root-Cause Classification**.

Instead of someone reading an obscure stack trace or raw network string, every failure gets classified into:
- `Timeout` (no response within configured window)
- `DNS` (hostname failed to resolve)
- `Connection Refused` (service down or port closed)
- `Server Error` (5xx backend crash)
- `Client Error` (4xx bad request / auth issue)

It's deterministic pattern analysis against network errors and status codes—giving our engineers an immediate diagnostic direction before they even open a ticket."

---

### Beat 10 · Ask the Assistant — Interactive Ops Chatbot

> **CUE:** Click the **floating bot icon** in the bottom-right corner of the screen. Click the **'What\'s down?'** suggestion chip.

"And finally—this directly addresses the last piece of your feedback: *'Add chatbots / AI agents'*. We built a floating operational assistant right into the bottom corner of every page.

You don't even have to hunt through dashboards. Just click the assistant or ask:
- *'What’s down?'*
- *'Slowest APIs'*
- *'Outages today'*

Look at the response: it immediately returns live telemetry, uptime streaks, and direct clickable links to the failing services.

And I want to be 100% transparent about how it works: right now, without corporate approval for external LLM APIs, this is an honest, keyword-matched engine running directly against our PostgreSQL database and root-cause classifier. No hallucinatory answers, no security leaks. And when LLM/agent access is approved in Phase 2, this exact UI widget connects directly to our model."

---

## 3. Under the Hood (~2 Minutes)

"For anyone curious about how this is actually engineered:

- **Frontend:** Built with React, TypeScript, Tailwind CSS, and Recharts. Live data is handled by React Query, which runs the 15-second polling loop and manages cache invalidation.
- **Backend:** Node.js Express in TypeScript. Every single request is validated with Zod schemas before touching the database—invalid data literally cannot be written.
- **Scheduler:** A parallel `node-cron` worker that evaluates intervals and fires checks simultaneously—it runs the exact same loop whether monitoring 5 endpoints or 500.
- **Performance Engine:** `loadTest.service.ts` uses an asynchronous worker pool to burst traffic and calculate statistical percentiles.
- **Root-Cause Service:** `rootCause.service.ts` uses regex pattern matching against network error strings and HTTP status codes.
- **Chat Engine:** `chat.service.ts` parses intent and keywords to query real-time database views.
- **Database & Cache:** PostgreSQL for time-series persistence (every single check is an immutable row), fronted by Redis caching summary stats for 30 seconds so frequent dashboard reloads never degrade database performance."

---

## 4. Response Matrix to Manager Feedback

Here is how every single item from the feedback session is addressed:

| # | Manager Feedback Point | Platform Status | How It Is Handled in the Demo |
|---|---|---|---|
| **1** | **API performance testing engine, concurrent bulk requests** | **Built (v1)** | Demonstrated live on Endpoint Details with p50, p95, p99 percentiles and RPS metrics. |
| **2** | **Auto root-cause analysis** | **Built (v1)** | Demonstrated on Dashboard Recent Failures and Daily Reports (Timeout, DNS, Connection Refused, 5xx). |
| **3** | **Chatbots / AI agents** | **Built (v1 Rule-Based)** | Demonstrated live via the floating chat widget on every page querying telemetry without LLM risk. |
| **4** | **Proactive anomaly & degradation detection** | **Phase 2.1 Roadmap** | Statistical baseline tracking (moving average + std dev) to alert on latency creep before an outage occurs. |
| **5** | **Multi-channel alerting & incident grouping** | **Phase 2.2 Roadmap** | Webhook integration (Slack / Teams / Email) with deduplication so 10 failed pings = 1 incident. |
| **6** | **Auto-remediation (Human-in-the-loop)** | **Phase 2.3 Roadmap** | Remediation suggestions with one-click approval buttons (e.g. restart pod, flush Redis cache). |
| **7** | **Pod & Kubernetes observability** | **Phase 2.4 Roadmap** | Direct OpenShift & Kubernetes cluster metrics integration once cluster access is provisioned. |

---

## 5. The Closing Punchline

> **CUE:** Close your laptop or turn back to your manager.

"To sum it up: **Add an API once, and we are tracking its availability, latency, load capacity, and root causes forever.** 

What questions can I answer for you?"
