import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { endpointRouter } from "./routes/endpoint.routes";
import { monitorRouter } from "./routes/monitor.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { reportRouter } from "./routes/report.routes";
import { importRouter } from "./routes/import.routes";
import { openapiRouter } from "./routes/openapi.routes";
import { errorHandler } from "./middleware/errorHandler";
import { startScheduler } from "./cron/scheduler";
import { connectRedis } from "./config/redis";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/endpoints", endpointRouter);
app.use("/api/monitor", monitorRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/reports", reportRouter);
app.use("/api/import", importRouter);
app.use("/api/openapi", openapiRouter);

app.use(errorHandler);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

async function main() {
  try {
    await connectRedis();
  } catch (err) {
    console.warn("Redis connection failed — dashboard caching will be skipped:", err);
  }

  startScheduler();

  app.listen(PORT, () => {
    console.log(`API monitoring backend listening on http://localhost:${PORT}`);
  });
}

main();
