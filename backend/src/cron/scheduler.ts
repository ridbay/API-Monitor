import cron from "node-cron";
import { endpointRepository } from "../repositories/endpoint.repository";
import { statisticsRepository } from "../repositories/statistics.repository";
import { executeCheck } from "../services/monitoring.service";
import { INTERVAL_MS } from "../types";
import { maintainPartitions } from "../services/accessLogStore.service";

async function tick() {
  const endpoints = await endpointRepository.findActive();
  if (endpoints.length === 0) return;

  const stats = await statisticsRepository.findAll();
  const lastCheckedByEndpoint = new Map(stats.map((s) => [s.endpoint_id, s.last_checked]));

  const due = endpoints.filter((endpoint) => {
    const lastChecked = lastCheckedByEndpoint.get(endpoint.id);
    if (!lastChecked) return true;
    const elapsed = Date.now() - new Date(lastChecked).getTime();
    return elapsed >= INTERVAL_MS[endpoint.interval];
  });

  await Promise.allSettled(due.map((endpoint) => executeCheck(endpoint)));
}

export function startScheduler() {
  cron.schedule(
    "* * * * *",
    () => {
      tick().catch((err) => console.error("Scheduler tick failed:", err));
    },
    { noOverlap: true }
  );
  // Access-log retention: pre-create next month's partition, drop expired months.
  cron.schedule("15 3 * * *", () => {
    maintainPartitions()
      .then(({ dropped }) => dropped.length && console.log(`Dropped expired access-log partitions: ${dropped.join(", ")}`))
      .catch((err) => console.error("Access-log partition maintenance failed:", err));
  });
  console.log("Monitoring scheduler started (checks every minute for due endpoints).");
}
