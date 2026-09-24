import axios from "axios";
import { Endpoint } from "../types";

export interface LoadTestOptions {
  concurrency: number;
  requestCount: number;
}

export interface LoadTestResult {
  endpoint_id: number;
  concurrency: number;
  request_count: number;
  success_count: number;
  failure_count: number;
  error_rate: number;
  duration_ms: number;
  throughput_rps: number;
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  status_code_breakdown: Record<string, number>;
  ran_at: string;
}

interface RequestOutcome {
  ok: boolean;
  statusCode: number | null;
  responseTime: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function fireOne(endpoint: Endpoint): Promise<RequestOutcome> {
  const startedAt = Date.now();
  try {
    const response = await axios.request({
      url: endpoint.url,
      method: endpoint.method,
      timeout: endpoint.timeout,
      validateStatus: () => true,
    });
    return {
      ok: response.status === endpoint.expected_status,
      statusCode: response.status,
      responseTime: Date.now() - startedAt,
    };
  } catch {
    return { ok: false, statusCode: null, responseTime: Date.now() - startedAt };
  }
}

// Deliberately not written to monitoring_results — a burst of on-demand load
// would skew the uptime/availability stats those rows feed into.
export async function runLoadTest(endpoint: Endpoint, options: LoadTestOptions): Promise<LoadTestResult> {
  const { concurrency, requestCount } = options;
  const outcomes: RequestOutcome[] = [];
  const startedAt = Date.now();

  for (let fired = 0; fired < requestCount; fired += concurrency) {
    const batchSize = Math.min(concurrency, requestCount - fired);
    const batch = await Promise.all(Array.from({ length: batchSize }, () => fireOne(endpoint)));
    outcomes.push(...batch);
  }

  const durationMs = Date.now() - startedAt;
  const responseTimes = outcomes.map((o) => o.responseTime).sort((a, b) => a - b);
  const successCount = outcomes.filter((o) => o.ok).length;
  const failureCount = outcomes.length - successCount;

  const statusCodeBreakdown: Record<string, number> = {};
  for (const o of outcomes) {
    const key = o.statusCode === null ? "error" : String(o.statusCode);
    statusCodeBreakdown[key] = (statusCodeBreakdown[key] ?? 0) + 1;
  }

  return {
    endpoint_id: endpoint.id,
    concurrency,
    request_count: outcomes.length,
    success_count: successCount,
    failure_count: failureCount,
    error_rate: outcomes.length > 0 ? Number(((failureCount / outcomes.length) * 100).toFixed(2)) : 0,
    duration_ms: durationMs,
    throughput_rps: durationMs > 0 ? Number((outcomes.length / (durationMs / 1000)).toFixed(2)) : 0,
    latency: {
      min: responseTimes[0] ?? 0,
      max: responseTimes[responseTimes.length - 1] ?? 0,
      avg:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length)
          : 0,
      p50: percentile(responseTimes, 50),
      p95: percentile(responseTimes, 95),
      p99: percentile(responseTimes, 99),
    },
    status_code_breakdown: statusCodeBreakdown,
    ran_at: new Date().toISOString(),
  };
}
