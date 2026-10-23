import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { endpointRouter } from "./routes/endpoint.routes";
import { monitorRouter } from "./routes/monitor.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { reportRouter } from "./routes/report.routes";
import { importRouter } from "./routes/import.routes";
import { openapiRouter } from "./routes/openapi.routes";
import { loadTestRouter } from "./routes/loadTest.routes";
import { chatRouter } from "./routes/chat.routes";
import { topologyRouter } from "./routes/topology.routes";
import { tracerouteRouter } from "./routes/traceroute.routes";
import { executiveRouter } from "./routes/executive.routes";
import { incidentRouter, notificationRouter } from "./routes/incident.routes";
import { remediationRouter } from "./routes/remediation.routes";
import { discoveryRouter } from "./routes/discovery.routes";
import { loadSuiteRouter } from "./routes/loadSuite.routes";
import { errorHandler } from "./middleware/errorHandler";
import { pool } from "./config/db";

dotenv.config();

export const app = express();
app.use(cors());
// Log batches posted as JSON to /api/discovery/ingest can run to megabytes.
app.use(express.json({ limit: "20mb" }));

// Liveness: the process is up. Readiness: it can also reach Postgres.
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

app.use("/api/endpoints", endpointRouter);
app.use("/api/monitor", monitorRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/reports", reportRouter);
app.use("/api/import", importRouter);
app.use("/api/openapi", openapiRouter);
app.use("/api/load-test", loadTestRouter);
app.use("/api/chat", chatRouter);
app.use("/api/topology", topologyRouter);
app.use("/api/traceroute", tracerouteRouter);
app.use("/api/executive", executiveRouter);
app.use("/api/incidents", incidentRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/remediation", remediationRouter);
app.use("/api/discovery", discoveryRouter);
app.use("/api/load-suites", loadSuiteRouter);

app.use(errorHandler);
