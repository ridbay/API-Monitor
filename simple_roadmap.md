Phase 1: Foundation (Days 1-3)
Goal

Get a basic monitoring platform running end-to-end.

Deliverables

✅ Backend API

✅ Database schema

✅ Basic React UI

✅ Monitoring scheduler

Tasks

Backend

Create FastAPI service
Setup PostgreSQL
Create tables:
endpoints
monitoring_results
alerts
users

Frontend

React dashboard skeleton
Login page (optional for demo)
Sidebar navigation

Monitoring Engine

Scheduled HTTP checks every 1-5 mins
Capture:
Status Code
Response Time
Availability
Timestamp
Phase 2: Endpoint Management (Days 4-6)
Goal

Allow users to add APIs for monitoring.

Deliverables

✅ Endpoint Configuration GUI

✅ Bulk Upload

✅ Endpoint Discovery Framework

Tasks

Build screens:

Add Endpoint
Name
URL
Method
Headers
Auth Type
Monitoring Frequency

Bulk Import

Accept:

name,url,method

Database

Store endpoint metadata.

Initial Auto-discovery

For MVP:

Swagger/OpenAPI URL import
Extract endpoints automatically
Register discovered APIs

This directly addresses the manager's requirement for adding new endpoints automatically.

Phase 3: Synthetic Monitoring Engine (Days 7-10)
Goal

Implement the actual synthetic monitoring platform.

Deliverables

✅ Health Checks

✅ Latency Tracking

✅ Error Tracking

✅ Availability Calculations

KPIs

Track:

Availability %
Response Time
Latency
Success Rate
Error Rate
Request Count

Store historical results.

Scheduling

Use:

APScheduler

or

Celery + Redis

Each endpoint gets its own schedule.

Phase 4: Dashboard & Visualization (Days 11-14)
Goal

Create the "robust dashboard" requested in the assignment.

Dashboard Views
Executive Overview
Total APIs
Healthy APIs
Failed APIs
Average Response Time
Availability %

Endpoint Trend View

Charts:

Latency Trend
Availability Trend
Failure Trend

Endpoint Detail View
Last Check
Response History
Top Errors
SLA Graph

Suggested stack:

React
Recharts
Material UI

Phase 5: Alerting & Reporting (Days 15-17)
Goal

Detect issues automatically.

Deliverables

✅ Alert Engine

✅ Incident Tracking

✅ Reports

Alert Rules

Examples:

Availability < 95%
Response Time > Threshold
5 Consecutive Failures

Notifications

For Demo:

Email
Dashboard Notification

Optional:

Teams
Slack

Phase 6: Universal Monitoring Framework (Days 18-20)
Goal

Address the manager's "universal solution" vision.

Support
REST APIs
GET
POST
PUT
DELETE

GraphQL

Basic endpoint monitoring

Website Monitoring

Examples provided by your manager:

Google
Jumia
MTN Website
Config Driven

Store monitoring configurations in DB.

No code changes needed to add endpoints.

Phase 7: Demo Preparation (Days 21-23)
Goal

Produce a polished demo for review.

Demo Flow
Scenario 1

Add new endpoint through UI.

Scenario 2

Auto-discover endpoints from Swagger.

Scenario 3

Run synthetic tests.

Scenario 4

Generate failures intentionally.

Scenario 5

Show dashboard trends.

Scenario 6

Display reports.

Recommended MVP Architecture
React Dashboard
|
|
FastAPI Backend
|

---

| | |
PostgreSQL Redis Scheduler
|
Monitoring Results
|
Synthetic API Checks
|
Public APIs / Test APIs

Scope Control for First Demo

Focus only on:

✅ REST API Monitoring

✅ Bulk Endpoint Registration

✅ Synthetic Checks

✅ Dashboard

✅ Historical Trends

✅ Alerting

Defer:

❌ AI recommendations

❌ Kubernetes

❌ Distributed agents

❌ Advanced anomaly detection

❌ Multi-tenant architecture

These can become Phase 2 after the demo.

Expected Demo Outcome

By the review, you should be able to show:

Adding APIs through a GUI.
Automatic endpoint onboarding through Swagger/OpenAPI. (Implementation choice to satisfy auto-discovery requirement.)
Scheduled synthetic monitoring.
KPI trend visualization.
Failure alerts and reporting.

This roadmap should comfortably get you to a strong working demo while still aligning with Ayodeji Akanbi's vision of a reusable, organization-wide synthetic API monitoring platform.
