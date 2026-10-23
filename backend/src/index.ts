import { app } from "./app";
import { recoverInterruptedRuns } from "./services/loadSuite.service";
import { startScheduler } from "./cron/scheduler";
import { connectRedis } from "./config/redis";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

async function main() {
  try {
    await connectRedis();
  } catch (err) {
    console.warn("Redis connection failed — dashboard caching will be skipped:", err);
  }

  await recoverInterruptedRuns().catch((err) => console.warn("Could not recover interrupted load test runs:", err));
  // With several API replicas, exactly one must run the scheduler; the Helm
  // chart sets SCHEDULER_ENABLED=false on the API and runs a separate one.
  if (process.env.SCHEDULER_ENABLED !== "false") startScheduler();
  else console.log("Scheduler disabled on this instance (SCHEDULER_ENABLED=false).");

  app.listen(PORT, () => {
    console.log(`API monitoring backend listening on http://localhost:${PORT}`);
  });
}

main();
