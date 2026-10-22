import axios from "axios";
import { pool } from "../config/db";
import { HttpError } from "../middleware/errorHandler";
import { endpointRepository } from "../repositories/endpoint.repository";
import { Endpoint } from "../types";
import { isInternalHost } from "../utils/hosts";
import { createEndpointSchema } from "./endpoint.service";
import { isStaticAsset, normalizePath, parseLogLine, ParsedRequest } from "./logParser.service";
import { executeCheck } from "./monitoring.service";

export type DiscoveredRouteStatus = "NEW" | "MONITORED" | "PROMOTED" | "IGNORED";

export interface DiscoveredRoute {
  id: number;
  scheme: string;
  host: string;
  method: string;
  path_template: string;
  sample_path: string;
  service_name: string | null;
  pods: string[];
  request_count: number;
  error_count: number;
  status_counts: Record<string, number>;
  status: DiscoveredRouteStatus;
  endpoint_id: number | null;
  baseline_status: "up" | "down" | null;
  baseline_status_code: number | null;
  baseline_response_time: number | null;
  baseline_error: string | null;
  baseline_checked_at: string | null;
  first_seen: string;
  last_seen: string;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  error_rate_pct: number;
}

export interface IngestDefaults {
  host?: string;
  scheme?: string;
  service?: string;
  pod?: string;
}

export interface IngestResult {
  batch_id: number;
  lines_received: number;
  lines_parsed: number;
  lines_skipped_static: number;
  lines_without_host: number;
  lines_unparsed: number;
  unparsed_samples: string[];
  routes_seen: number;
  routes_new: number;
  routes_rejected: number;
  new_routes: DiscoveredRoute[];
}

export const MAX_LINES_PER_BATCH = 200_000;
// A host whose paths keep producing new templates almost always has an ID
// shape the normalizer doesn't recognize; capping it keeps one noisy service
// from flooding the catalog.
const MAX_ROUTES_PER_HOST = 500;
const MAX_BASELINE_PROBES = 25;
const BASELINE_CONCURRENCY = 5;
const BASELINE_TIMEOUT_MS = 5000;
// Upper bounds (ms) for latency_buckets; the last bucket is everything above 10s.
const LATENCY_BOUNDS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, Infinity];

interface Aggregate {
  scheme: string;
  host: string;
  method: string;
  template: string;
  samplePath: string;
  sampleOk: boolean;
  service?: string;
  pods: Set<string>;
  requests: number;
  errors: number;
  statusCounts: Record<string, number>;
  latencySum: number;
  latencySamples: number;
  buckets: number[];
  firstSeen: Date;
  lastSeen: Date;
}

// ---------- Ingest ----------

export async function ingestLogs(
  lines: string[],
  defaults: IngestDefaults = {},
  source = "api",
  options: { waitForBaseline?: boolean } = {}
): Promise<IngestResult> {
  if (lines.length > MAX_LINES_PER_BATCH) {
    throw new HttpError(413, `At most ${MAX_LINES_PER_BATCH} lines per batch (got ${lines.length})`);
  }

  const now = new Date();
  const aggregates = new Map<string, Aggregate>();
  const counts = { parsed: 0, static: 0, noHost: 0, unparsed: 0 };
  const unparsedSamples: string[] = [];
  const defaultHost = defaults.host?.trim().toLowerCase() || undefined;

  for (const line of lines) {
    if (!line.trim()) continue;
    const req = parseLogLine(line);
    if (!req) {
      counts.unparsed++;
      if (unparsedSamples.length < 5) unparsedSamples.push(line.slice(0, 300));
      continue;
    }
    if (isStaticAsset(req.path)) {
      counts.static++;
      continue;
    }
    const host = req.host ?? defaultHost;
    if (!host) {
      counts.noHost++;
      continue;
    }
    counts.parsed++;
    accumulate(aggregates, req, host, defaults, now);
  }

  const { routes, rejected } = await upsertAggregates([...aggregates.values()]);
  const newRoutes = routes.filter((r) => r.inserted).map((r) => r.route);

  const { rows: [batch] } = await pool.query<{ id: number }>(
    `INSERT INTO log_ingest_batches (source, lines_received, lines_parsed, lines_skipped, routes_seen, routes_new)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [source, lines.length, counts.parsed, counts.static + counts.noHost + counts.unparsed, routes.length, newRoutes.length]
  );

  const baseline = probeBaselines(newRoutes.filter((r) => r.status === "NEW" && r.method === "GET"));
  if (options.waitForBaseline) await baseline;
  else baseline.catch((err) => console.error("Baseline probing failed:", err));

  return {
    batch_id: batch.id,
    lines_received: lines.length,
    lines_parsed: counts.parsed,
    lines_skipped_static: counts.static,
    lines_without_host: counts.noHost,
    lines_unparsed: counts.unparsed,
    unparsed_samples: unparsedSamples,
    routes_seen: routes.length,
    routes_new: newRoutes.length,
    routes_rejected: rejected,
    new_routes: newRoutes.slice(0, 50),
  };
}

function accumulate(aggregates: Map<string, Aggregate>, req: ParsedRequest, host: string, defaults: IngestDefaults, now: Date) {
  const template = normalizePath(req.path);
  const key = `${host}|${req.method}|${template}`;
  const seenAt = req.timestamp ?? now;
  let agg = aggregates.get(key);
  if (!agg) {
    agg = {
      scheme: (req.scheme ?? defaults.scheme ?? (isInternalHost(host) ? "http" : "https")).toLowerCase(),
      host,
      method: req.method,
      template,
      samplePath: req.path,
      sampleOk: req.status < 400,
      pods: new Set(),
      requests: 0,
      errors: 0,
      statusCounts: {},
      latencySum: 0,
      latencySamples: 0,
      buckets: LATENCY_BOUNDS.map(() => 0),
      firstSeen: seenAt,
      lastSeen: seenAt,
    };
    aggregates.set(key, agg);
  }

  agg.requests++;
  if (req.status >= 500) agg.errors++;
  agg.statusCounts[req.status] = (agg.statusCounts[req.status] ?? 0) + 1;
  agg.service ??= req.service ?? defaults.service;
  const pod = req.pod ?? defaults.pod;
  if (pod && agg.pods.size < 50) agg.pods.add(pod);
  // Prefer a sample that got a successful response; it's the better URL to probe.
  if (!agg.sampleOk && req.status < 400) {
    agg.samplePath = req.path;
    agg.sampleOk = true;
  }
  if (req.latencyMs !== undefined && req.latencyMs >= 0) {
    agg.latencySum += req.latencyMs;
    agg.latencySamples++;
    agg.buckets[LATENCY_BOUNDS.findIndex((bound) => req.latencyMs! <= bound)]++;
  }
  if (seenAt < agg.firstSeen) agg.firstSeen = seenAt;
  if (seenAt > agg.lastSeen) agg.lastSeen = seenAt;
}

async function upsertAggregates(aggregates: Aggregate[]) {
  if (!aggregates.length) return { routes: [] as Array<{ route: DiscoveredRoute; inserted: boolean }>, rejected: 0 };

  const hosts = [...new Set(aggregates.map((a) => a.host))];
  const { rows: existing } = await pool.query<{ host: string; method: string; path_template: string }>(
    `SELECT host, method, path_template FROM discovered_routes WHERE host = ANY($1)`,
    [hosts]
  );
  const known = new Set(existing.map((r) => `${r.host}|${r.method}|${r.path_template}`));
  const perHost = new Map<string, number>();
  for (const r of existing) perHost.set(r.host, (perHost.get(r.host) ?? 0) + 1);
  const monitored = await monitoredRouteKeys();

  const client = await pool.connect();
  const routes: Array<{ route: DiscoveredRoute; inserted: boolean }> = [];
  let rejected = 0;
  try {
    await client.query("BEGIN");
    // Busiest first, so the per-host cap keeps the routes that matter most.
    for (const agg of aggregates.sort((a, b) => b.requests - a.requests)) {
      const key = `${agg.host}|${agg.method}|${agg.template}`;
      if (!known.has(key)) {
        const count = perHost.get(agg.host) ?? 0;
        if (count >= MAX_ROUTES_PER_HOST) {
          rejected++;
          continue;
        }
        perHost.set(agg.host, count + 1);
      }
      const endpointId = monitored.get(key) ?? null;
      const { rows } = await client.query(
        `INSERT INTO discovered_routes (
           scheme, host, method, path_template, sample_path, service_name, pods,
           request_count, error_count, status_counts, latency_sum_ms, latency_samples, latency_buckets,
           status, endpoint_id, first_seen, last_seen
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (host, method, path_template) DO UPDATE SET
           request_count = discovered_routes.request_count + EXCLUDED.request_count,
           error_count = discovered_routes.error_count + EXCLUDED.error_count,
           status_counts = (
             SELECT jsonb_object_agg(k, COALESCE((discovered_routes.status_counts->>k)::bigint, 0)
                                      + COALESCE((EXCLUDED.status_counts->>k)::bigint, 0))
             FROM (SELECT jsonb_object_keys(discovered_routes.status_counts)
                   UNION SELECT jsonb_object_keys(EXCLUDED.status_counts)) AS keys(k)
           ),
           latency_sum_ms = discovered_routes.latency_sum_ms + EXCLUDED.latency_sum_ms,
           latency_samples = discovered_routes.latency_samples + EXCLUDED.latency_samples,
           latency_buckets = ARRAY(
             SELECT a + b FROM unnest(discovered_routes.latency_buckets, EXCLUDED.latency_buckets)
               WITH ORDINALITY AS t(a, b, i) ORDER BY i
           ),
           pods = ARRAY(SELECT DISTINCT unnest(discovered_routes.pods || EXCLUDED.pods) LIMIT 50),
           service_name = COALESCE(discovered_routes.service_name, EXCLUDED.service_name),
           first_seen = LEAST(discovered_routes.first_seen, EXCLUDED.first_seen),
           last_seen = GREATEST(discovered_routes.last_seen, EXCLUDED.last_seen)
         RETURNING *, (xmax = 0) AS inserted`,
        [
          agg.scheme, agg.host, agg.method, agg.template, agg.samplePath, agg.service ?? null, [...agg.pods],
          agg.requests, agg.errors, JSON.stringify(agg.statusCounts), agg.latencySum, agg.latencySamples, agg.buckets,
          endpointId ? "MONITORED" : "NEW", endpointId, agg.firstSeen, agg.lastSeen,
        ]
      );
      const { inserted, ...row } = rows[0];
      routes.push({ route: present(row), inserted });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { routes, rejected };
}

// host|method|template for every monitored endpoint, so routes we already
// watch are recognized instead of offered again.
async function monitoredRouteKeys(): Promise<Map<string, number>> {
  const { rows: endpoints } = await pool.query<Endpoint>(`SELECT * FROM endpoints WHERE deleted_at IS NULL`);
  const keys = new Map<string, number>();
  for (const e of endpoints) {
    try {
      const u = new URL(e.url);
      keys.set(`${u.host.toLowerCase()}|${e.method}|${normalizePath(u.pathname)}`, e.id);
    } catch {
      // Unparseable URL can't match a discovered route.
    }
  }
  return keys;
}

// ---------- Baseline probing ----------

async function probeBaselines(routes: DiscoveredRoute[]): Promise<void> {
  const queue = routes.slice(0, MAX_BASELINE_PROBES);
  const worker = async () => {
    for (let route = queue.shift(); route; route = queue.shift()) await probeBaseline(route);
  };
  await Promise.all(Array.from({ length: BASELINE_CONCURRENCY }, worker));
}

async function probeBaseline(route: DiscoveredRoute): Promise<void> {
  const url = `${route.scheme}://${route.host}${route.sample_path}`;
  const startedAt = Date.now();
  let status: "up" | "down";
  let code: number | null = null;
  let error: string | null = null;
  try {
    const res = await axios.get(url, { timeout: BASELINE_TIMEOUT_MS, validateStatus: () => true, maxRedirects: 3 });
    code = res.status;
    status = res.status < 400 ? "up" : "down";
  } catch (err) {
    status = "down";
    error = (err as { code?: string; message?: string }).code ?? (err as Error).message;
  }
  await pool.query(
    `UPDATE discovered_routes
     SET baseline_status = $2, baseline_status_code = $3, baseline_response_time = $4, baseline_error = $5, baseline_checked_at = NOW()
     WHERE id = $1`,
    [route.id, status, code, Date.now() - startedAt, error]
  );

  if (status === "up" && process.env.LOG_DISCOVERY_AUTO_PROMOTE === "true") {
    await promoteRoute(route.id, {}).catch((err) => console.warn(`Auto-promote of ${url} failed:`, err.message));
  }
}

// ---------- Review actions ----------

export async function promoteRoute(
  id: number,
  overrides: { url?: string; name?: string; expected_status?: number; interval?: string }
): Promise<{ route: DiscoveredRoute; endpoint: Endpoint }> {
  const route = await requireRoute(id);
  if (route.status === "PROMOTED" || route.status === "MONITORED") {
    throw new HttpError(409, `This route is already monitored (endpoint ${route.endpoint_id})`);
  }
  if (route.method !== "GET") {
    throw new HttpError(409, `Only GET routes can be monitored; probing ${route.method} would repeat its side effects on every check`);
  }

  const baselineOk = route.baseline_status_code !== null && route.baseline_status_code < 400;
  const parsed = createEndpointSchema.safeParse({
    name: overrides.name ?? `${route.service_name ?? route.host} ${route.method} ${route.path_template}`,
    url: overrides.url ?? `${route.scheme}://${route.host}${route.sample_path}`,
    method: "GET",
    expected_status: overrides.expected_status ?? (baselineOk ? route.baseline_status_code! : 200),
    interval: overrides.interval ?? "5m",
  });
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

  const created = await endpointRepository.create(parsed.data);
  const { rows: [endpoint] } = await pool.query<Endpoint>(
    `UPDATE endpoints SET source = 'SOURCE_LOG_DISCOVERED' WHERE id = $1 RETURNING *`,
    [created.id]
  );
  const { rows: [updated] } = await pool.query(
    `UPDATE discovered_routes SET status = 'PROMOTED', endpoint_id = $2 WHERE id = $1 RETURNING *`,
    [id, endpoint.id]
  );
  executeCheck(endpoint).catch((err) => console.error(`First check of promoted endpoint ${endpoint.id} failed:`, err));
  return { route: present(updated), endpoint };
}

export async function setRouteIgnored(id: number, ignored: boolean): Promise<DiscoveredRoute> {
  const route = await requireRoute(id);
  const from: DiscoveredRouteStatus = ignored ? "NEW" : "IGNORED";
  if (route.status !== from) throw new HttpError(409, `Route is ${route.status.toLowerCase()}, not ${from.toLowerCase()}`);
  const { rows } = await pool.query(
    `UPDATE discovered_routes SET status = $2 WHERE id = $1 RETURNING *`,
    [id, ignored ? "IGNORED" : "NEW"]
  );
  return present(rows[0]);
}

// ---------- Queries ----------

export async function listRoutes(filters: { status?: string; host?: string; q?: string } = {}): Promise<DiscoveredRoute[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.status && filters.status !== "all") {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.host) {
    values.push(filters.host);
    conditions.push(`host = $${values.length}`);
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(`(path_template ILIKE $${values.length} OR host ILIKE $${values.length} OR service_name ILIKE $${values.length})`);
  }
  const { rows } = await pool.query(
    `SELECT * FROM discovered_routes ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY request_count DESC, id ASC LIMIT 1000`,
    values
  );
  return rows.map(present);
}

export async function discoverySummary() {
  const { rows: byStatus } = await pool.query<{ status: DiscoveredRouteStatus; count: number }>(
    `SELECT status, COUNT(*)::int AS count FROM discovered_routes GROUP BY status`
  );
  const { rows: [totals] } = await pool.query<{ hosts: number; services: number }>(
    `SELECT COUNT(DISTINCT host)::int AS hosts, COUNT(DISTINCT service_name)::int AS services FROM discovered_routes`
  );
  const { rows: batches } = await pool.query(
    `SELECT * FROM log_ingest_batches ORDER BY created_at DESC LIMIT 10`
  );
  const counts = { NEW: 0, MONITORED: 0, PROMOTED: 0, IGNORED: 0 } as Record<DiscoveredRouteStatus, number>;
  for (const r of byStatus) counts[r.status] = r.count;
  return { counts, hosts: totals.hosts, services: totals.services, recent_batches: batches };
}

// Per-host rollup used by the topology view.
export async function discoveredServices() {
  const { rows } = await pool.query<{
    host: string; service_name: string | null; routes: number; requests: string; errors: string; pods: string[];
    latency_sum: string; latency_samples: string;
  }>(
    `SELECT host, MAX(service_name) AS service_name, COUNT(*)::int AS routes,
            SUM(request_count) AS requests, SUM(error_count) AS errors,
            ARRAY(SELECT DISTINCT p FROM discovered_routes d2, unnest(d2.pods) p WHERE d2.host = d.host) AS pods,
            SUM(latency_sum_ms) AS latency_sum, SUM(latency_samples) AS latency_samples
     FROM discovered_routes d
     WHERE status <> 'IGNORED'
     GROUP BY host`
  );
  return rows.map((r) => ({
    host: r.host,
    service_name: r.service_name,
    routes: r.routes,
    requests: Number(r.requests),
    error_rate_pct: Number(r.requests) > 0 ? round1((Number(r.errors) / Number(r.requests)) * 100) : 0,
    avg_latency_ms: Number(r.latency_samples) > 0 ? Math.round(Number(r.latency_sum) / Number(r.latency_samples)) : null,
    pods: r.pods,
  }));
}

// ---------- Helpers ----------

async function requireRoute(id: number) {
  const { rows } = await pool.query(`SELECT * FROM discovered_routes WHERE id = $1`, [id]);
  if (!rows.length) throw new HttpError(404, `Discovered route ${id} not found`);
  return present(rows[0]);
}

// Adds the derived stats the API serves; BIGINT columns arrive as strings.
function present(row: Record<string, any>): DiscoveredRoute {
  const requests = Number(row.request_count);
  const errors = Number(row.error_count);
  const samples = Number(row.latency_samples);
  const { latency_sum_ms, latency_samples, latency_buckets, ...rest } = row;
  return {
    ...(rest as DiscoveredRoute),
    request_count: requests,
    error_count: errors,
    avg_latency_ms: samples > 0 ? Math.round(Number(latency_sum_ms) / samples) : null,
    p95_latency_ms: samples > 0 ? percentileFromBuckets(latency_buckets as number[], 0.95) : null,
    error_rate_pct: requests > 0 ? round1((errors / requests) * 100) : 0,
  };
}

// Upper bound of the bucket holding the percentile; approximate by design,
// which is what lets it be merged across batches without keeping samples.
function percentileFromBuckets(buckets: number[], p: number): number {
  const total = buckets.reduce((s, n) => s + n, 0);
  let cumulative = 0;
  for (let i = 0; i < buckets.length; i++) {
    cumulative += buckets[i];
    if (cumulative >= total * p) return Number.isFinite(LATENCY_BOUNDS[i]) ? LATENCY_BOUNDS[i] : LATENCY_BOUNDS[i - 1];
  }
  return LATENCY_BOUNDS[LATENCY_BOUNDS.length - 2];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
