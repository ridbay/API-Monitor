// Load generator, run in a worker thread so a heavy test can't starve the
// main event loop that serves the API and runs scheduled health checks.
// Receives a LoadJob via workerData; posts a WorkerTick every second and a
// single WorkerDone at the end. Posting "stop" ends the run early.
import { parentPort, workerData } from "worker_threads";
import http from "http";
import https from "https";
import axios from "axios";
import type { LoadJob, LoadSummary, LatencyStats, WorkerMessage } from "../services/loadSuite.types";

const RESERVOIR_SIZE = 100_000;

interface EndpointStats {
  count: number;
  errors: number;
  latencies: number[];
  seen: number;
  statusCodes: Record<string, number>;
}

const job = workerData as LoadJob;
let stopRequested = false;
parentPort!.on("message", (msg) => {
  if (msg === "stop") stopRequested = true;
});

const agentOptions = { keepAlive: true, maxSockets: job.profile.virtual_users };
const client = axios.create({
  httpAgent: new http.Agent(agentOptions),
  httpsAgent: new https.Agent(agentOptions),
  validateStatus: () => true,
  maxRedirects: 0,
});

const totals = new Map<number, EndpointStats>(
  job.endpoints.map((e) => [e.id, { count: 0, errors: 0, latencies: [], seen: 0, statusCodes: {} }])
);
let second = { count: 0, errors: 0, latencies: [] as number[], perEndpoint: {} as Record<number, { count: number; errors: number }> };
let activeVus = 0;

const totalWeight = job.endpoints.reduce((s, e) => s + e.weight, 0);
function pickEndpoint() {
  let r = Math.random() * totalWeight;
  for (const e of job.endpoints) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return job.endpoints[job.endpoints.length - 1];
}

// Shared pacing: each request takes the next free slot, so the combined rate
// across all virtual users never exceeds max_rps.
let nextSlot = 0;
async function pace() {
  if (!job.profile.max_rps) return;
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + 1000 / job.profile.max_rps;
  if (slot > now) await sleep(slot - now);
}

async function fire() {
  const endpoint = pickEndpoint();
  const startedAt = performance.now();
  let status: string;
  let ok: boolean;
  try {
    const res = await client.request({ url: endpoint.url, method: endpoint.method, timeout: endpoint.timeout });
    status = String(res.status);
    ok = res.status === endpoint.expected_status;
  } catch (err) {
    const e = err as { code?: string };
    status = e.code === "ECONNABORTED" ? "timeout" : e.code ?? "error";
    ok = false;
  }
  const latency = performance.now() - startedAt;

  const stats = totals.get(endpoint.id)!;
  stats.count++;
  if (!ok) stats.errors++;
  stats.statusCodes[status] = (stats.statusCodes[status] ?? 0) + 1;
  // Reservoir sampling keeps percentiles accurate without holding every sample of a long run.
  stats.seen++;
  if (stats.latencies.length < RESERVOIR_SIZE) stats.latencies.push(latency);
  else {
    const j = Math.floor(Math.random() * stats.seen);
    if (j < RESERVOIR_SIZE) stats.latencies[j] = latency;
  }

  second.count++;
  if (!ok) second.errors++;
  second.latencies.push(latency);
  const per = (second.perEndpoint[endpoint.id] ??= { count: 0, errors: 0 });
  per.count++;
  if (!ok) per.errors++;
}

async function virtualUser(index: number, startedAt: number, endsAt: number) {
  const { virtual_users, ramp_up_s } = job.profile;
  const delay = virtual_users > 1 ? (index / (virtual_users - 1)) * ramp_up_s * 1000 : 0;
  await sleep(Math.max(0, startedAt + delay - Date.now()));
  activeVus++;
  try {
    while (!stopRequested && Date.now() < endsAt) {
      await pace();
      if (stopRequested || Date.now() >= endsAt) break;
      await fire();
    }
  } finally {
    activeVus--;
  }
}

async function main() {
  const startedAt = Date.now();
  const endsAt = startedAt + job.profile.duration_s * 1000;

  const ticker = setInterval(() => {
    const s = second;
    second = { count: 0, errors: 0, latencies: [], perEndpoint: {} };
    post({
      type: "tick",
      tick: {
        t: Math.round((Date.now() - startedAt) / 1000),
        active_vus: activeVus,
        rps: s.count,
        error_rate_pct: s.count ? round1((s.errors / s.count) * 100) : 0,
        latency: latencyStats(s.latencies),
        per_endpoint: s.perEndpoint,
      },
    });
  }, 1000);

  await Promise.all(Array.from({ length: job.profile.virtual_users }, (_, i) => virtualUser(i, startedAt, endsAt)));
  clearInterval(ticker);

  const durationMs = Date.now() - startedAt;
  const all = [...totals.values()];
  const count = all.reduce((s, e) => s + e.count, 0);
  const errors = all.reduce((s, e) => s + e.errors, 0);
  const summary: LoadSummary = {
    duration_ms: durationMs,
    cancelled: stopRequested,
    requests: count,
    errors,
    error_rate_pct: count ? round1((errors / count) * 100) : 0,
    throughput_rps: durationMs ? round1(count / (durationMs / 1000)) : 0,
    latency: latencyStats(all.flatMap((e) => e.latencies)),
    endpoints: job.endpoints.map((e) => {
      const st = totals.get(e.id)!;
      return {
        endpoint_id: e.id,
        name: e.name,
        method: e.method,
        url: e.url,
        requests: st.count,
        errors: st.errors,
        error_rate_pct: st.count ? round1((st.errors / st.count) * 100) : 0,
        latency: latencyStats(st.latencies),
        status_codes: st.statusCodes,
      };
    }),
  };
  post({ type: "done", summary });
}

function latencyStats(samples: number[]): LatencyStats {
  if (!samples.length) return { min: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  const sorted = Float64Array.from(samples).sort();
  const at = (p: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]);
  let sum = 0;
  for (const v of sorted) sum += v;
  return {
    min: Math.round(sorted[0]),
    avg: Math.round(sum / sorted.length),
    p50: at(0.5),
    p90: at(0.9),
    p95: at(0.95),
    p99: at(0.99),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

function post(msg: WorkerMessage) {
  parentPort!.postMessage(msg);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

main().catch((err) => post({ type: "error", error: (err as Error).message }));
