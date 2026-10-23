// Shared between the main thread (loadSuite.service.ts) and the worker
// (workers/loadWorker.ts); type-only so the worker doesn't pull in the app.

export interface LoadProfile {
  virtual_users: number;
  ramp_up_s: number;
  duration_s: number;
  max_rps: number | null;
}

export interface LoadJobEndpoint {
  id: number;
  name: string;
  url: string;
  method: string;
  expected_status: number;
  timeout: number;
  weight: number;
}

export interface LoadJob {
  profile: LoadProfile;
  endpoints: LoadJobEndpoint[];
}

export interface LatencyStats {
  min: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
}

export interface WorkerTick {
  t: number;
  active_vus: number;
  rps: number;
  error_rate_pct: number;
  latency: LatencyStats;
  per_endpoint: Record<number, { count: number; errors: number }>;
}

export interface LoadSummary {
  duration_ms: number;
  cancelled: boolean;
  requests: number;
  errors: number;
  error_rate_pct: number;
  throughput_rps: number;
  latency: LatencyStats;
  endpoints: Array<{
    endpoint_id: number;
    name: string;
    method: string;
    url: string;
    requests: number;
    errors: number;
    error_rate_pct: number;
    latency: LatencyStats;
    status_codes: Record<string, number>;
  }>;
}

export type WorkerMessage =
  | { type: "tick"; tick: WorkerTick }
  | { type: "done"; summary: LoadSummary }
  | { type: "error"; error: string };
