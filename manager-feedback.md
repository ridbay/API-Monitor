# Manager Feedback

Date: 2026-09-22
Context: feedback given after presenting the API monitoring platform.

## Raw feedback

> API performance testing engine, run concurrent bulk endpoint requests,
> Monitor internal MTN services, apis, endpoints, pods, bugs observability,
> Auto-detection of errors/issues and analyse the root cause,
> Auto-remediation,
> Decison layer (Human in the loop then automate later)
> The product will be microservices, they will be in pods (openshift clusters and kubernetes)
> Add chat bots/AI agents

## Where each point is tracked

| # | Feedback point | Status |
|---|---|---|
| 1 | API performance testing engine, concurrent bulk requests | Built — [backend/src/services/loadTest.service.ts](backend/src/services/loadTest.service.ts) |
| 2 | Monitor internal MTN services, pods, observability | Blocked — no OpenShift/Kubernetes cluster access; see [prd.md](prd.md) §14.2 |
| 3 | Auto-detection of errors + root cause analysis | Root cause: built — [backend/src/services/rootCause.service.ts](backend/src/services/rootCause.service.ts). Auto-detection (anomaly/degradation flagging): not yet built |
| 4 | Auto-remediation (human-in-the-loop, then automate) | Not yet built; see [prd.md](prd.md) §14.4 |
| 5 | Microservices in pods (OpenShift/Kubernetes) | Blocked — no cluster access; see [prd.md](prd.md) §14.5 |
| 6 | Chatbots / AI agents | Built (rule-based, no LLM access approved) — [backend/src/services/chat.service.ts](backend/src/services/chat.service.ts), [frontend/src/pages/Assistant.tsx](frontend/src/pages/Assistant.tsx); see [prd.md](prd.md) §14.6 |

Full phased breakdown lives in [prd.md](prd.md) §14 ("Phase 2 Vision: AIOps Roadmap").
