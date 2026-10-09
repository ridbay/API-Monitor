import { pool } from "./db";
import { backfillHistory } from "./history";
import { endpointRepository } from "../repositories/endpoint.repository";

// One-off: backfills 30 days of synthetic history for every existing endpoint.
async function seedHistory() {
  const endpoints = await endpointRepository.findAll();
  const total = await backfillHistory(endpoints);
  console.log(total > 0 ? `History backfill complete (${total} results).` : "History already present, nothing to backfill.");
  await pool.end();
}

seedHistory().catch((err) => {
  console.error("History backfill failed:", err);
  process.exit(1);
});
