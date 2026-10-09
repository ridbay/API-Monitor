import { pool } from "./db";
import { Endpoint } from "../types";
import { recalculateStats } from "../services/monitoring.service";

const HISTORY_DAYS = 30;
const STEP_MS = 5 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const INSERT_CHUNK = 5000;
const DEFAULT_RESPONSE_TIME = 300;

interface SyntheticResult {
  status: "up" | "down";
  status_code: number | null;
  response_time: number;
  error_message: string | null;
  created_at: Date;
}

interface Outage {
  start: number;
  end: number;
}

// Deterministic PRNG so the same endpoint always gets the same history shape.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

// A few outages spread across the window, with at least one in the last 24h and last 7d
// so every dashboard range has something to show.
function planOutages(rand: () => number, now: number): Outage[] {
  const windows = [
    { from: now - DAY_MS, to: now - 60 * 60_000 },
    { from: now - 7 * DAY_MS, to: now - DAY_MS },
    { from: now - HISTORY_DAYS * DAY_MS, to: now - 7 * DAY_MS },
    { from: now - HISTORY_DAYS * DAY_MS, to: now - 7 * DAY_MS },
  ];
  return windows.map(({ from, to }) => {
    const start = from + rand() * (to - from);
    const durationMs = (10 + rand() * 50) * 60_000;
    return { start, end: start + durationMs };
  });
}

async function getProfile(endpoint: Endpoint) {
  const { rows } = await pool.query(
    `SELECT status, status_code, response_time
     FROM monitoring_results
     WHERE endpoint_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [endpoint.id]
  );

  const upTimes = rows.filter((r) => r.status === "up" && r.response_time != null).map((r) => r.response_time);
  const allTimes = rows.filter((r) => r.response_time != null).map((r) => r.response_time);
  const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

  // Endpoints whose recent checks all failed are treated as having always been down.
  const alwaysDown = rows.length > 0 && rows.every((r) => r.status === "down");

  return {
    alwaysDown,
    downStatusCode: alwaysDown ? (rows[0].status_code as number | null) : null,
    baseResponseTime: upTimes.length
      ? average(upTimes)
      : allTimes.length
        ? average(allTimes)
        : DEFAULT_RESPONSE_TIME,
  };
}

function generateResults(endpoint: Endpoint, profile: Awaited<ReturnType<typeof getProfile>>, from: number, to: number) {
  const rand = mulberry32(endpoint.id * 7919);
  const outages = planOutages(rand, to);
  // A multi-day stretch of degraded latency so the 30-day trend isn't flat.
  const degradedStart = to - (8 + rand() * 12) * DAY_MS;
  const degradedEnd = degradedStart + (1 + rand()) * DAY_MS;

  const results: SyntheticResult[] = [];
  for (let t = from; t < to; t += STEP_MS) {
    const created_at = new Date(t);
    const hourOfDay = created_at.getUTCHours() + created_at.getUTCMinutes() / 60;
    // Busier (slower) mid-afternoon UTC, quieter overnight.
    const diurnal = 1 + 0.2 * Math.sin(((hourOfDay - 8) / 24) * 2 * Math.PI);
    const degraded = t >= degradedStart && t < degradedEnd ? 1.5 : 1;
    const spike = rand() < 0.01 ? 2 + rand() * 2 : 1;
    const responseTime = Math.max(
      20,
      Math.round(profile.baseResponseTime * diurnal * degraded * spike * Math.exp(0.15 * gaussian(rand)))
    );

    if (profile.alwaysDown) {
      results.push({
        status: "down",
        status_code: profile.downStatusCode,
        response_time: responseTime,
        error_message:
          profile.downStatusCode != null
            ? `Expected status ${endpoint.expected_status}, got ${profile.downStatusCode}`
            : `timeout of ${endpoint.timeout}ms exceeded`,
        created_at,
      });
      continue;
    }

    const inOutage = outages.some((o) => t >= o.start && t < o.end);
    if (inOutage || rand() < 0.002) {
      const timedOut = rand() < 0.4;
      const statusCode = timedOut ? null : [500, 502, 503][Math.floor(rand() * 3)];
      results.push({
        status: "down",
        status_code: statusCode,
        response_time: timedOut ? endpoint.timeout : responseTime,
        error_message: timedOut
          ? `timeout of ${endpoint.timeout}ms exceeded`
          : `Expected status ${endpoint.expected_status}, got ${statusCode}`,
        created_at,
      });
      continue;
    }

    results.push({
      status: "up",
      status_code: endpoint.expected_status,
      response_time: responseTime,
      error_message: null,
      created_at,
    });
  }
  return results;
}

/**
 * Backfills synthetic monitoring history for the last 30 days, ending just before each
 * endpoint's earliest real result so it never overlaps live data. Re-running is a no-op
 * once an endpoint already has 30 days of history.
 */
export async function backfillHistory(endpoints: Endpoint[]) {
  const now = Date.now();
  const from = now - HISTORY_DAYS * DAY_MS;
  let total = 0;

  for (const endpoint of endpoints) {
    const { rows } = await pool.query(
      `SELECT MIN(created_at) AS earliest FROM monitoring_results WHERE endpoint_id = $1`,
      [endpoint.id]
    );
    const to = rows[0].earliest ? new Date(rows[0].earliest).getTime() - STEP_MS : now;
    if (to <= from) continue;

    const profile = await getProfile(endpoint);
    const results = generateResults(endpoint, profile, from, to);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < results.length; i += INSERT_CHUNK) {
        const chunk = results.slice(i, i + INSERT_CHUNK);
        await client.query(
          `INSERT INTO monitoring_results (endpoint_id, status, status_code, response_time, error_message, created_at)
           SELECT $1, * FROM unnest($2::text[], $3::int[], $4::int[], $5::text[], $6::timestamptz[])`,
          [
            endpoint.id,
            chunk.map((r) => r.status),
            chunk.map((r) => r.status_code),
            chunk.map((r) => r.response_time),
            chunk.map((r) => r.error_message),
            chunk.map((r) => r.created_at),
          ]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await recalculateStats(endpoint.id);
    total += results.length;
    console.log(`Backfilled ${results.length} results for "${endpoint.name}".`);
  }

  return total;
}
