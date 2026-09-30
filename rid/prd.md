Product Requirements Document (PRD)
Universal Synthetic API Monitoring & Bulk API Testing Platform

Project Owner: Ridwan Balogun [ MTN Nigeria ]
Delivery Target: 30 September 2026
Project Assignment: Bulk API Testing + Synthetic API Monitoring Automation Interface + Robust Dashboard for Trending and Reporting. The solution should be universal, adaptable to any API/schema, support automatic endpoint onboarding, KPI trending, and provide a GUI for configuration.

1. Executive Summary

Build a lightweight web application that allows users to:

Register APIs/endpoints for monitoring.
Run synthetic health checks automatically.
Monitor endpoint performance over time.
View trends on a dashboard.
Import multiple endpoints at once.
Automatically discover endpoints from Swagger/OpenAPI specifications.
Generate simple reports.

The goal is simplicity, extensibility, and easy demonstration, not enterprise-scale complexity.

This platform should feel like a mini version of Postman Monitoring, Pingdom, Datadog Synthetic Monitoring, or New Relic Synthetics.

2. Product Vision

Provide a centralized platform for monitoring APIs from a single dashboard without depending on application teams.

Users should be able to:

"Add an API once and immediately begin tracking its availability, performance, and reliability trends."

3. Objectives
   Business Objectives
   Provide API visibility.
   Reduce manual endpoint testing.
   Track performance trends.
   Demonstrate automation capabilities.
   Establish a reusable monitoring framework.
   Technical Objectives
   Easy deployment.
   Easy onboarding of endpoints.
   Simple architecture.
   Minimal dependencies.
   Fast demo-ready implementation.
4. Out of Scope (For Demo)

These will NOT be built in version 1.

❌ AI recommendations

❌ Anomaly detection

❌ Kubernetes deployment

❌ Multi-tenancy

❌ Role-based permissions

❌ Complex alert routing

❌ Distributed microservices

❌ Machine learning

5. Technology Stack
   Frontend
   Core
   React
   React Router
   Axios
   TailwindCSS
   React Query
   Charts
   Recharts
   Backend
   Core
   ExpressJS
   TypeScript
   Scheduling
   Node Cron
   HTTP Monitoring
   Axios
   Database
   PostgreSQL
   Cache
   Redis
6. High-Level Architecture
   +-------------------+
   | React Dashboard |
   +---------+---------+
   |
   |
   +---------v---------+
   | Express API |
   +---------+---------+
   |
   |
   +---------v---------+
   | PostgreSQL |
   +---------+---------+
   |
   |
   +---------v---------+
   | Monitoring Worker |
   | Node Cron |
   +---------+---------+
   |
   |
   +---------v---------+
   | APIs/Endpoints |
   +-------------------+

Simple.

Easy to understand.

Easy to demo.

Easy to extend.

7. Users
   Primary User

DevOps Engineer

Secondary Users
Developers
QA Engineers
Technology Managers 8. Functional Requirements
Module 1: Endpoint Management
Purpose

Manage monitored endpoints.

Features
Create Endpoint

User enters:

Name
URL
HTTP Method
Monitoring Interval
Expected Status Code
Timeout

Example

MTN Website
https://www.mtn.ng

GET
5 Minutes
200
5000 ms

View Endpoints

Display:

Name
URL
Status
Last Checked
Availability
Response Time

Edit Endpoint

User can modify:

URL
Interval
Timeout
Expected Status
Delete Endpoint

Soft delete preferred.

Module 2: Bulk Import
Purpose

Add multiple endpoints quickly.

Supported Formats

CSV

Example

name,url,method
Google,https://google.com,GET
MTN,https://mtn.ng,GET
Jumia,https://jumia.com.ng,GET

Workflow
Upload CSV
Validate
Preview
Import

Module 3: OpenAPI Auto Discovery
Purpose

Automatically discover APIs.

Input

Swagger URL

Example

https://api.example.com/swagger.json

System Actions

Fetch specification.

Extract endpoints.

Display for selection.

Create monitors automatically.

Example Result
GET /users
POST /users
GET /orders
GET /products

Module 4: Monitoring Engine
Purpose

Monitor endpoints automatically.

Scheduler

Using:

node-cron

Supported intervals:

1 Minute
5 Minutes
15 Minutes
30 Minutes
1 Hour

Collected Metrics
Availability
Up
Down

Response Time
Milliseconds

Success Rate
Successful Checks
/
Total Checks

Error Count
Number of Failed Checks

Status Code
200
201
400
404
500

Monitoring Flow
Read Endpoint
↓

Execute Request
↓

Measure Time
↓

Store Result
↓

Update Statistics

Module 5: Dashboard
Purpose

Provide a real-time overview.

Dashboard Home
Summary Cards
Total Endpoints
Healthy Endpoints
Failed Endpoints
Average Response Time

Health Distribution

Pie Chart

Healthy
Warning
Down

Recent Failures

Table

Endpoint
Time
Status
Error

Module 6: Endpoint Details
Purpose

Provide detailed insights.

Endpoint Overview

Display:

Name
URL
Method
Current Status
Availability %

Trends

Charts:

Response Time Trend
24 Hours
7 Days
30 Days

Availability Trend
Success vs Failure

Status Code Distribution
200
404
500
etc

Module 7: Reporting
Purpose

Generate monitoring summaries.

Daily Report

Display:

Availability
Average Response
Total Checks
Failures

Weekly Report

Display:

Top Fast APIs
Most Unstable APIs
Best Availability

9. Database Design
   endpoints
   id
   name
   url
   method
   expected_status
   timeout
   interval
   is_active
   created_at
   updated_at

monitoring_results
id
endpoint_id
status
status_code
response_time
error_message
created_at

endpoint_statistics
id
endpoint_id
availability
success_rate
avg_response_time
last_checked

10. API Endpoints
    Endpoint Management
    GET /api/endpoints
    GET /api/endpoints/:id
    POST /api/endpoints
    PUT /api/endpoints/:id
    DELETE /api/endpoints/:id

Monitoring
POST /api/monitor/run/:id
POST /api/monitor/run-all

Dashboard
GET /api/dashboard/summary
GET /api/dashboard/trends

Reports
GET /api/reports/daily
GET /api/reports/weekly

11. Frontend Pages
1. Login Page (Optional)

For demo:

Hardcoded login

or skip completely.

2. Dashboard

Route

/

3. Endpoints

Route

/endpoints

4. Create Endpoint

Route

/endpoints/new

5. Endpoint Details

Route

/endpoints/:id

6. Import Endpoints

Route

/import

7. Reports

Route

/reports

12. Tailwind Design System
    Theme
    Primary: Blue
    Success: Green
    Warning: Amber
    Failure: Red
    Background: Slate

Components

Build reusable:

Card
Button
Modal
Table
Badge
Chart Container
Input
Select

Dashboard Style

Use:

Cards
Tables
Charts

Avoid:

Complex animations
Heavy UI libraries
Overengineering

13. Demo Success Criteria

The demo will be considered successful if you can:

✅ Add endpoints

✅ Import endpoints via CSV

✅ Monitor endpoints automatically

✅ Display uptime

✅ Display response time

✅ Show trends

✅ Show failed endpoints

✅ Auto-discover Swagger/OpenAPI endpoints

✅ Present everything through a clean Tailwind dashboard

14. Phase 2 Vision: AIOps Roadmap (Post-Demo, Not in v1 Scope)

Context

Manager feedback (2026-09-22) describes a broader long-term vision that extends beyond the 30 Sep 2026 demo. Several items below directly reverse the "Out of Scope" list in Section 4. They are captured here as a roadmap, not as work planned for the current delivery date.

14.1 Bulk Concurrent Performance Testing Engine

Extend Module 4 beyond single scheduled health checks into on-demand load testing: fire concurrent requests at an endpoint (configurable concurrency, duration, ramp-up) and report latency percentiles (p50/p95/p99), throughput, and error rate under load.

14.2 Internal MTN Service & Pod Observability

Move beyond HTTP-only synthetic checks to pull native Kubernetes/OpenShift signals: pod status, restarts, CPU/memory, liveness/readiness probe results. Likely integration points: Kubernetes API server, Prometheus/OpenShift metrics.

14.3 Auto-Detection of Errors & Root Cause Analysis

Anomaly detection over collected metrics (response time, error rate, status codes) to flag issues before they're manually noticed, plus a diagnostic layer that correlates symptoms (e.g. pod restarts + latency spike + error code pattern) to suggest a likely root cause.

14.4 Decision Layer & Auto-Remediation

A proposal-and-approval workflow: system detects an issue, proposes a remediation action (restart pod, scale replica, clear cache, roll back), and a human approves before it executes. Once trust is established, selected low-risk actions can be automated without approval. Requires an audit trail of every action taken and by whom/what.

14.5 Microservices Deployment (OpenShift/Kubernetes)

The platform itself is re-architected from the current Express monolith + cron worker (Section 6) into independently deployable services (ingestion, monitoring engine, remediation engine, API/BFF), packaged as containers and deployed as pods on OpenShift/Kubernetes.

14.6 Chatbot / AI Agent Interface

A conversational interface (likely backed by an LLM) for querying system/endpoint status, summarizing incidents, and triggering approved remediation actions in natural language, in addition to the dashboard UI.

Sequencing Note

Recommended order: 14.1 and 14.2 first (extend existing monitoring primitives), then 14.3 (needs data from 14.1/14.2 to detect against), then 14.4 (needs 14.3's detections to act on), with 14.5 as an infrastructure migration that can happen in parallel, and 14.6 last as a UI layer over the completed decision pipeline.

Recommended Project Structure
api-monitoring-platform/

frontend/
├── src/
│ ├── pages/
│ ├── components/
│ ├── services/
│ ├── hooks/
│ ├── layouts/
│ └── routes/

backend/
├── src/
│ ├── controllers/
│ ├── services/
│ ├── cron/
│ ├── routes/
│ ├── entities/
│ ├── repositories/
│ ├── middleware/
│ └── utils/

shared/

This structure keeps the project simple, maintainable, demo-friendly, and fully aligned with your manager's requirement for a universal API monitoring platform while leveraging the technologies you already know well: React, ExpressJS, Redis, PostgreSQL, and TailwindCSS.
