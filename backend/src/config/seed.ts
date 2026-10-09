import { pool } from "./db";
import { backfillHistory } from "./history";
import { CreateEndpointInput, endpointRepository } from "../repositories/endpoint.repository";
import { executeCheck } from "../services/monitoring.service";

const SAMPLE_ENDPOINTS: CreateEndpointInput[] = [
  {
    name: "JSONPlaceholder Posts",
    url: "https://jsonplaceholder.typicode.com/posts",
    method: "GET",
    expected_status: 200,
    timeout: 5000,
    interval: "1m",
  },
  {
    name: "GitHub API",
    url: "https://api.github.com",
    method: "GET",
    expected_status: 200,
    timeout: 5000,
    interval: "5m",
  },
  {
    name: "httpbin GET",
    url: "https://httpbin.org/get",
    method: "GET",
    expected_status: 200,
    timeout: 5000,
    interval: "1m",
  },
  {
    name: "httpbin POST",
    url: "https://httpbin.org/post",
    method: "POST",
    expected_status: 200,
    timeout: 5000,
    interval: "5m",
  },
  {
    // Intentionally failing so the dashboard shows a "down" endpoint.
    name: "httpbin 503 (always down)",
    url: "https://httpbin.org/status/503",
    method: "GET",
    expected_status: 200,
    timeout: 5000,
    interval: "1m",
  },
];

async function seed() {
  // Count soft-deleted rows too, so we only seed a brand-new database
  // and never re-add samples after a user has removed them.
  const result = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM endpoints`);
  if (Number(result.rows[0].count) > 0) {
    console.log("Seed skipped: endpoints already exist.");
    await pool.end();
    return;
  }

  const created = await endpointRepository.createMany(SAMPLE_ENDPOINTS);
  console.log(`Seeded ${created.length} sample endpoints.`);

  // One real check first so the backfilled history matches each endpoint's actual latency/status.
  await Promise.allSettled(created.map((endpoint) => executeCheck(endpoint)));
  const total = await backfillHistory(created);
  console.log(`Seeded ${total} historical results.`);
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
