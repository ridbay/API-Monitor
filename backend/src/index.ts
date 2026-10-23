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
import { recoverInterruptedRuns } from "./services/loadSuite.service";
import { errorHandler } from "./middleware/errorHandler";
import { startScheduler } from "./cron/scheduler";
import { connectRedis } from "./config/redis";

dotenv.config();

const app = express();
app.use(cors());
// Log batches posted as JSON to /api/discovery/ingest can run to megabytes.
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

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

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

async function main() {
  try {
    await connectRedis();
  } catch (err) {
    console.warn("Redis connection failed — dashboard caching will be skipped:", err);
  }

  await recoverInterruptedRuns().catch((err) => console.warn("Could not recover interrupted load test runs:", err));
  startScheduler();

  app.listen(PORT, () => {
    console.log(`API monitoring backend listening on http://localhost:${PORT}`);
  });
}

main();
