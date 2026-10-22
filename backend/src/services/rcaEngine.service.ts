import dns from "dns/promises";
import net from "net";
import { pool } from "../config/db";
import { Endpoint, MonitoringInterval, MonitoringResult } from "../types";
import { classifyFailure } from "./rootCause.service";
import { addTimelineEvent, getIncidentDetails, Incident } from "./incident.service";

export type RcaScope = "endpoint" | "service" | "fleet";
export type RcaConfidence = "high" | "medium" | "low";
export type RemediationAction =
  | "reprobe"
  | "run_traceroute"
  | "update_endpoint_timeout"
  | "reduce_check_frequency"
  | "rollout_restart"
  | "scale_deployment"
  | "manual";
export type RemediationRisk = "low" | "medium" | "high";

export interface RcaEvidence {
  signal: string;
  finding: string;
  abnormal: boolean;
}

export interface RcaRecommendation {
  step: number;
  title: string;
  rationale: string;
  action: RemediationAction;
  params: Record<string, unknown>;
  risk: RemediationRisk;
  requires?: "kubernetes";
}

export interface RcaReport {
  incident_id: number;
  incident_reference: string;
  generated_at: string;
  diagnosis: {
    category: string;
    summary: string;
    confidence: RcaConfidence;
    scope: RcaScope;
  };
  evidence: RcaEvidence[];
  recommendations: RcaRecommendation[];
  signals_unavailable: string[];
}

interface ProbeResult {
  host: string;
  port: number;
  dnsOk: boolean;
  dnsError?: string;
  tcpOk: boolean;
  tcpError?: string;
  tcpMs?: number;
}

interface Signals {
  endpoint: Endpoint;
  host: string;
  internal: boolean;
  latest: MonitoringResult | null;
  onset: Date;
  stateChanges: number;
  windowSize: number;
  baseline: { samples: number; avg: number; p95: number } | null;
  preOnsetAvg: number | null;
  configChangedMinutesBeforeOnset: number | null;
  siblings: { total: number; failing: number };
  fleet: { otherHosts: number; failingHosts: number };
  probe: ProbeResult;
}

const HISTORY_WINDOW = 20;
const PROBE_TIMEOUT_MS = 3000;
const PRE_ONSET_MS = 30 * 60_000;
const BASELINE_MS = 24 * 60 * 60_000;
const CONFIG_CHANGE_WINDOW_MIN = 60;
const SLOWER_INTERVAL: Record<MonitoringInterval, MonitoringInterval> = {
  "1m": "5m",
  "5m": "15m",
  "15m": "30m",
  "30m": "1h",
  "1h": "1h",
};

// ---------- Public API ----------

export async function analyzeIncident(incidentRef: number | string): Promise<RcaReport> {
  const incident = await getIncidentDetails(incidentRef);
  const report = incident.endpoint_id
    ? await analyzeEndpointIncident(incident, incident.endpoint_id)
    : unlinkedIncidentReport(incident);

  await pool.query(
    `INSERT INTO rca_reports (incident_id, diagnosis_category, confidence, report) VALUES ($1, $2, $3, $4)`,
    [incident.id, report.diagnosis.category, report.diagnosis.confidence, JSON.stringify(report)]
  );
  await pool.query(
    `UPDATE incidents SET root_cause = $2, root_cause_category = $3, updated_at = NOW() WHERE id = $1`,
    [incident.id, report.diagnosis.summary, report.diagnosis.category]
  );
  await addTimelineEvent(
    incident.id,
    "RCA_COMPLETED",
    `Diagnosis (${report.diagnosis.confidence} confidence, ${report.diagnosis.scope} scope): ${report.diagnosis.summary} ` +
      `${report.recommendations.length} recommended step(s).`,
    "RCA_ENGINE",
    { category: report.diagnosis.category }
  );

  return report;
}

export async function getLatestRcaReport(incidentId: number): Promise<RcaReport | null> {
  const { rows } = await pool.query<{ report: RcaReport }>(
    `SELECT report FROM rca_reports WHERE incident_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [incidentId]
  );
  return rows[0]?.report ?? null;
}

// ---------- Signal collection ----------

async function analyzeEndpointIncident(incident: Incident, endpointId: number): Promise<RcaReport> {
  const { rows } = await pool.query<Endpoint>(`SELECT * FROM endpoints WHERE id = $1`, [endpointId]);
  if (!rows.length) return unlinkedIncidentReport(incident);

  const signals = await collectSignals(rows[0], new Date(incident.created_at));
  const { diagnosis, recommendations } = diagnose(signals);

  return {
    incident_id: incident.id,
    incident_reference: incident.reference,
    generated_at: new Date().toISOString(),
    diagnosis,
    evidence: describeEvidence(signals),
    recommendations: recommendations.map((r, i) => ({ ...r, step: i + 1 })),
    signals_unavailable: ["Kubernetes pod status, restarts and OOMKilled events (no cluster connected)"],
  };
}

async function collectSignals(endpoint: Endpoint, incidentCreatedAt: Date): Promise<Signals> {
  const host = hostOf(endpoint.url);

  const { rows: recent } = await pool.query<MonitoringResult>(
    `SELECT * FROM monitoring_results WHERE endpoint_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [endpoint.id, HISTORY_WINDOW]
  );
  const latest = recent[0] ?? null;

  // Onset is the first failure of the current down streak; if the endpoint
  // has already recovered, fall back to when the incident opened.
  let onset = incidentCreatedAt;
  if (latest?.status === "down") {
    let i = 0;
    while (i + 1 < recent.length && recent[i + 1].status === "down") i++;
    onset = new Date(recent[i].created_at);
  }

  let stateChanges = 0;
  for (let i = 1; i < recent.length; i++) if (recent[i].status !== recent[i - 1].status) stateChanges++;

  const [baseline, preOnsetAvg, latestByEndpoint, probe] = await Promise.all([
    latencyBaseline(endpoint.id, onset),
    preOnsetLatency(endpoint.id, onset),
    latestStatusByEndpoint(),
    probeHost(endpoint.url),
  ]);
  const siblings = siblingHealth(latestByEndpoint, endpoint.id, host);
  const fleet = fleetHealth(latestByEndpoint, host);

  const changedAt = new Date(endpoint.updated_at);
  const minutesBefore = (onset.getTime() - changedAt.getTime()) / 60_000;
  const createdAt = new Date(endpoint.created_at).getTime();
  const configChangedMinutesBeforeOnset =
    minutesBefore >= 0 && minutesBefore <= CONFIG_CHANGE_WINDOW_MIN && changedAt.getTime() - createdAt > 1000
      ? Math.round(minutesBefore)
      : null;

  return {
    endpoint,
    host,
    internal: isInternalHost(host),
    latest,
    onset,
    stateChanges,
    windowSize: recent.length,
    baseline,
    preOnsetAvg,
    configChangedMinutesBeforeOnset,
    siblings,
    fleet,
    probe,
  };
}

async function latencyBaseline(endpointId: number, onset: Date) {
  const { rows } = await pool.query<{ samples: number; avg: number | null; p95: number | null }>(
    `SELECT COUNT(*)::int AS samples,
            AVG(response_time)::int AS avg,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time)::int AS p95
     FROM monitoring_results
     WHERE endpoint_id = $1 AND status = 'up'
       AND created_at >= $2 AND created_at < $3`,
    [endpointId, new Date(onset.getTime() - BASELINE_MS), new Date(onset.getTime() - PRE_ONSET_MS)]
  );
  const r = rows[0];
  return r.samples >= 5 && r.avg !== null && r.p95 !== null ? { samples: r.samples, avg: r.avg, p95: r.p95 } : null;
}

async function preOnsetLatency(endpointId: number, onset: Date): Promise<number | null> {
  const { rows } = await pool.query<{ samples: number; avg: number | null }>(
    `SELECT COUNT(*)::int AS samples, AVG(response_time)::int AS avg
     FROM monitoring_results
     WHERE endpoint_id = $1 AND status = 'up' AND created_at >= $2 AND created_at < $3`,
    [endpointId, new Date(onset.getTime() - PRE_ONSET_MS), onset]
  );
  return rows[0].samples >= 2 ? rows[0].avg : null;
}

// Latest result per active endpoint, used for both sibling and fleet views.
type EndpointStatus = { id: number; url: string; status: string | null };

async function latestStatusByEndpoint(): Promise<EndpointStatus[]> {
  const { rows } = await pool.query(
    `SELECT e.id, e.url, mr.status
     FROM endpoints e
     LEFT JOIN LATERAL (
       SELECT status FROM monitoring_results WHERE endpoint_id = e.id ORDER BY created_at DESC, id DESC LIMIT 1
     ) mr ON true
     WHERE e.deleted_at IS NULL AND e.is_active = true`
  );
  return rows;
}

function siblingHealth(all: EndpointStatus[], endpointId: number, host: string) {
  const siblings = all.filter((e) => e.id !== endpointId && hostOf(e.url) === host && e.status !== null);
  return { total: siblings.length, failing: siblings.filter((e) => e.status === "down").length };
}

function fleetHealth(all: EndpointStatus[], host: string) {
  const byHost = new Map<string, { total: number; down: number }>();
  for (const e of all) {
    const h = hostOf(e.url);
    if (h === host || e.status === null) continue;
    const entry = byHost.get(h) ?? { total: 0, down: 0 };
    entry.total++;
    if (e.status === "down") entry.down++;
    byHost.set(h, entry);
  }
  const hosts = [...byHost.values()];
  return { otherHosts: hosts.length, failingHosts: hosts.filter((h) => h.down * 2 > h.total).length };
}

async function probeHost(url: string): Promise<ProbeResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { host: url, port: 0, dnsOk: false, dnsError: "invalid URL", tcpOk: false };
  }
  const host = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;

  let address: string;
  try {
    address = (await withTimeout(dns.lookup(host), PROBE_TIMEOUT_MS, "DNS lookup timed out")).address;
  } catch (err) {
    return { host, port, dnsOk: false, dnsError: errorCode(err), tcpOk: false };
  }

  const startedAt = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect({ host: address, port });
      socket.setTimeout(PROBE_TIMEOUT_MS);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("timeout", () => {
        socket.destroy();
        reject(Object.assign(new Error("TCP connect timed out"), { code: "ETIMEDOUT" }));
      });
      socket.once("error", (err) => {
        socket.destroy();
        reject(err);
      });
    });
    return { host, port, dnsOk: true, tcpOk: true, tcpMs: Date.now() - startedAt };
  } catch (err) {
    return { host, port, dnsOk: true, tcpOk: false, tcpError: errorCode(err) };
  }
}

// ---------- Diagnosis ----------

type Draft = Omit<RcaRecommendation, "step">;

function diagnose(s: Signals): { diagnosis: RcaReport["diagnosis"]; recommendations: Draft[] } {
  const cause = s.latest ? classifyFailure(s.latest.status_code, s.latest.error_message) : null;
  const code = s.latest?.status_code ?? null;
  const target = `${s.probe.host}:${s.probe.port}`;
  const scope: RcaScope = fleetWide(s)
    ? "fleet"
    : s.siblings.total > 0 && s.siblings.failing === s.siblings.total
      ? "service"
      : "endpoint";
  const latencyRising =
    s.baseline !== null &&
    s.preOnsetAvg !== null &&
    s.preOnsetAvg >= s.baseline.avg * 1.5 &&
    s.preOnsetAvg - s.baseline.avg >= 50;

  const reprobe: Draft = {
    title: "Re-probe the endpoint to verify recovery",
    rationale: "Confirms whether the fix worked before the incident is resolved.",
    action: "reprobe",
    params: { endpoint_id: s.endpoint.id },
    risk: "low",
  };
  const traceroute: Draft = {
    title: `Run a network path diagnostic to ${s.probe.host}`,
    rationale: "Separates network-path problems from application problems.",
    action: "run_traceroute",
    params: { endpoint_id: s.endpoint.id },
    risk: "low",
  };
  const restart: Draft = s.internal
    ? {
        title: `Rollout-restart deployment ${deploymentName(s)}`,
        rationale: "Replaces wedged or crashed pods with fresh ones without downtime if replicas > 1.",
        action: "rollout_restart",
        params: { namespace: defaultNamespace(), deployment: deploymentName(s) },
        risk: "high",
        requires: "kubernetes",
      }
    : {
        title: `Check ${s.probe.host}'s status page or contact the provider`,
        rationale: "This is a third-party host; the fix has to happen on the provider's side.",
        action: "manual",
        params: {},
        risk: "low",
      };

  let category: string;
  let summary: string;
  let confidence: RcaConfidence;
  let recs: Draft[];

  if (scope === "fleet") {
    category = "shared_dependency";
    summary =
      `${s.fleet.failingHosts} of ${s.fleet.otherHosts} other monitored hosts are failing at the same time. ` +
      `This points to a problem on the monitoring side (egress, NAT, DNS resolver) or a shared upstream, not ${s.endpoint.name} itself.`;
    confidence = "medium";
    recs = [
      traceroute,
      {
        title: "Check the monitoring cluster's egress gateway, NAT and DNS resolver",
        rationale: "Simultaneous failures across unrelated hosts usually share a cause on the caller's side.",
        action: "manual",
        params: {},
        risk: "low",
      },
    ];
  } else if (!s.probe.dnsOk) {
    category = "dns_failure";
    summary = `Hostname ${s.probe.host} does not resolve (${s.probe.dnsError}).`;
    confidence = "high";
    recs = [
      {
        title: s.internal
          ? `Verify the Service/Route for ${s.probe.host} exists and cluster DNS (CoreDNS) is healthy`
          : `Verify the DNS records for ${s.probe.host} at the registrar/DNS provider`,
        rationale: "The name must resolve before any request can reach the service.",
        action: "manual",
        params: {},
        risk: "low",
      },
      traceroute,
    ];
  } else if (!s.probe.tcpOk) {
    const refused = s.probe.tcpError === "ECONNREFUSED";
    category = "service_unreachable";
    summary = refused
      ? `Nothing is accepting connections on ${target} — the process or its pods are down.`
      : `Connections to ${target} time out (${s.probe.tcpError}) — the host is down, a firewall is dropping traffic, or the network is partitioned.`;
    confidence = scope === "service" || refused ? "high" : "medium";
    recs = refused ? [restart] : [traceroute, restart];
  } else if (cause?.category === "timeout") {
    if (s.baseline && s.baseline.p95 > s.endpoint.timeout * 0.8) {
      const newTimeout = Math.ceil((s.baseline.p95 * 2) / 500) * 500;
      category = "timeout_too_tight";
      summary =
        `Normal p95 latency (${s.baseline.p95}ms) is within 20% of the ${s.endpoint.timeout}ms timeout, ` +
        `so ordinary slow responses are counted as failures.`;
      confidence = "high";
      recs = [
        {
          title: `Raise the check timeout from ${s.endpoint.timeout}ms to ${newTimeout}ms`,
          rationale: "Gives the endpoint headroom of 2× its normal p95 latency.",
          action: "update_endpoint_timeout",
          params: { endpoint_id: s.endpoint.id, timeout: newTimeout },
          risk: "medium",
        },
      ];
    } else if (latencyRising) {
      ({ category, summary, confidence, recs } = saturation(s));
    } else {
      category = "upstream_hang";
      summary =
        `${target} accepts connections but doesn't answer within ${s.endpoint.timeout}ms — ` +
        `likely worker/thread exhaustion or a slow downstream dependency.`;
      confidence = "medium";
      recs = [restart, slowDependency()];
    }
  } else if (cause?.category === "server_error") {
    if (s.configChangedMinutesBeforeOnset !== null) {
      category = "config_regression";
      summary =
        `The endpoint's configuration changed ${s.configChangedMinutesBeforeOnset} min before failures began, ` +
        `and it has returned HTTP ${code} since.`;
      confidence = "medium";
      recs = [
        {
          title: "Review and revert the recent endpoint configuration change",
          rationale: "The change is the closest preceding event to the failure onset.",
          action: "manual",
          params: { endpoint_id: s.endpoint.id, changed_at: s.endpoint.updated_at },
          risk: "medium",
        },
      ];
    } else if (latencyRising) {
      ({ category, summary, confidence, recs } = saturation(s));
    } else if (scope === "service") {
      category = "application_failure";
      summary =
        `All ${s.siblings.total + 1} monitored endpoints on ${s.host} are returning server errors — ` +
        `a service-wide failure such as a bad deploy or a crashed dependency.`;
      confidence = "high";
      recs = [restart, inspectLogs(s)];
    } else {
      category = "route_failure";
      summary =
        s.siblings.total > 0
          ? `Only this route fails with HTTP ${code} while ${s.siblings.total - s.siblings.failing} other endpoint(s) on ${s.host} are healthy — a handler bug or a dependency only this route uses.`
          : `This route returns HTTP ${code}; no other endpoints on ${s.host} are monitored to tell a route bug from a service-wide failure.`;
      confidence = s.siblings.total > 0 ? "medium" : "low";
      recs = [inspectLogs(s), restart];
    }
  } else if (cause?.category === "client_error") {
    ({ category, summary, confidence, recs } = clientError(s, code ?? 400));
  } else if (cause?.category === "connection_reset") {
    category = "connection_reset";
    summary = `${target} drops connections mid-request — the process may be crashing under load, or a proxy idle timeout/TLS problem is cutting requests.`;
    confidence = "medium";
    recs = [restart, inspectLogs(s)];
  } else {
    category = "unknown";
    summary = `No clear pattern: ${target} is reachable but the failure (${s.latest?.error_message ?? "none recorded"}) matches no known signature.`;
    confidence = "low";
    recs = [traceroute, inspectLogs(s)];
  }

  if (s.stateChanges >= 3) {
    summary += ` Failures are intermittent (${s.stateChanges} up/down changes in the last ${s.windowSize} checks).`;
    if (confidence === "high") confidence = "medium";
    else if (confidence === "medium") confidence = "low";
  }

  return { diagnosis: { category, summary, confidence, scope }, recommendations: [...recs, reprobe] };
}

function saturation(s: Signals) {
  const recs: Draft[] = s.internal
    ? [
        {
          title: `Scale deployment ${deploymentName(s)} out by 2 replicas`,
          rationale: "Latency climbed before errors started — the service is running out of capacity.",
          action: "scale_deployment",
          params: { namespace: defaultNamespace(), deployment: deploymentName(s), delta: 2 },
          risk: "high",
          requires: "kubernetes",
        },
      ]
    : [slowDependency()];
  return {
    category: "resource_saturation",
    summary:
      `Latency rose from a ${s.baseline!.avg}ms baseline to ${s.preOnsetAvg}ms in the 30 min before failures began — ` +
      `the service was saturating before it failed.`,
    confidence: "medium" as RcaConfidence,
    recs,
  };
}

function clientError(s: Signals, code: number) {
  if (code === 401 || code === 403) {
    return {
      category: "auth_failure",
      summary: `HTTP ${code}: the request is no longer authorized — credentials or tokens expired, were rotated, or permissions changed.`,
      confidence: "high" as RcaConfidence,
      recs: [
        {
          title: "Rotate or refresh the credentials the check uses",
          rationale: "The service is up but rejecting the monitor's identity.",
          action: "manual" as const,
          params: { endpoint_id: s.endpoint.id },
          risk: "low" as RemediationRisk,
        },
      ],
    };
  }
  if (code === 404 || code === 410) {
    return {
      category: "route_missing",
      summary: `HTTP ${code}: ${new URL(s.endpoint.url).pathname} no longer exists — the route was removed or renamed.`,
      confidence: "high" as RcaConfidence,
      recs: [
        {
          title: "Confirm the path in the service's current API and update the endpoint URL",
          rationale: "The host answers, but not at this path.",
          action: "manual" as const,
          params: { endpoint_id: s.endpoint.id },
          risk: "low" as RemediationRisk,
        },
      ],
    };
  }
  if (code === 429) {
    const slower = SLOWER_INTERVAL[s.endpoint.interval];
    const rec: Draft =
      slower !== s.endpoint.interval
        ? {
            title: `Reduce the check frequency from ${s.endpoint.interval} to ${slower}`,
            rationale: "Fewer probes keep the monitor under the service's rate limit.",
            action: "reduce_check_frequency",
            params: { endpoint_id: s.endpoint.id, interval: slower },
            risk: "low",
          }
        : {
            title: "Ask the service owner to raise the limit or allowlist the monitor",
            rationale: `Checks already run at the slowest interval (${s.endpoint.interval}), so other traffic from the monitor's IP is using up the limit.`,
            action: "manual",
            params: { endpoint_id: s.endpoint.id },
            risk: "low",
          };
    return {
      category: "rate_limited",
      summary: `HTTP 429: the service is rate-limiting the monitor.`,
      confidence: "high" as RcaConfidence,
      recs: [rec],
    };
  }
  return {
    category: "contract_mismatch",
    summary: `HTTP ${code}: the request no longer matches what the API expects (method, headers or body).`,
    confidence: "medium" as RcaConfidence,
    recs: [
      {
        title: "Compare the check's request against the service's current API contract",
        rationale: "A 4xx means the service is up and rejecting this specific request.",
        action: "manual" as const,
        params: { endpoint_id: s.endpoint.id },
        risk: "low" as RemediationRisk,
      },
    ],
  };
}

function inspectLogs(s: Signals): Draft {
  return {
    title: s.internal
      ? `Inspect logs for ${deploymentName(s)} around ${s.onset.toISOString()}`
      : `Capture the failing response (status, headers, body) from ${s.probe.host} for the provider`,
    rationale: "The application-side error explains what the HTTP status can't.",
    action: "manual",
    params: { since: s.onset.toISOString() },
    risk: "low",
  };
}

function slowDependency(): Draft {
  return {
    title: "Check the service's downstream dependencies (database, caches, third-party APIs) for latency",
    rationale: "A slow dependency holds request workers open until the caller times out.",
    action: "manual",
    params: {},
    risk: "low",
  };
}

function fleetWide(s: Signals): boolean {
  return s.fleet.otherHosts >= 2 && s.fleet.failingHosts * 2 >= s.fleet.otherHosts;
}

// ---------- Evidence ----------

function describeEvidence(s: Signals): RcaEvidence[] {
  const evidence: RcaEvidence[] = [];
  const latest = s.latest;

  evidence.push({
    signal: "Latest check",
    finding: latest
      ? `${latest.status.toUpperCase()} — ${latest.error_message ?? `HTTP ${latest.status_code}`} (${latest.response_time}ms)`
      : "No checks recorded",
    abnormal: latest?.status === "down",
  });
  evidence.push({
    signal: "Failure onset",
    finding: `${s.onset.toISOString()}; ${s.stateChanges} up/down change(s) in the last ${s.windowSize} checks`,
    abnormal: s.stateChanges >= 3,
  });
  evidence.push({
    signal: "DNS",
    finding: s.probe.dnsOk ? `${s.probe.host} resolves` : `${s.probe.host} failed to resolve (${s.probe.dnsError})`,
    abnormal: !s.probe.dnsOk,
  });
  if (s.probe.dnsOk) {
    evidence.push({
      signal: "TCP connect",
      finding: s.probe.tcpOk
        ? `${s.probe.host}:${s.probe.port} accepted a connection in ${s.probe.tcpMs}ms`
        : `${s.probe.host}:${s.probe.port} rejected the connection (${s.probe.tcpError})`,
      abnormal: !s.probe.tcpOk,
    });
  }
  evidence.push({
    signal: "Latency trend",
    finding:
      s.baseline && s.preOnsetAvg !== null
        ? `${s.baseline.avg}ms avg / ${s.baseline.p95}ms p95 baseline → ${s.preOnsetAvg}ms in the 30 min before onset`
        : s.baseline
          ? `${s.baseline.avg}ms avg / ${s.baseline.p95}ms p95 baseline; too few checks just before onset to compare`
          : "Not enough successful checks in the prior 24h for a baseline",
    abnormal: s.baseline !== null && s.preOnsetAvg !== null && s.preOnsetAvg >= s.baseline.avg * 1.5,
  });
  evidence.push({
    signal: "Same-host endpoints",
    finding:
      s.siblings.total === 0
        ? `No other monitored endpoints on ${s.host}`
        : `${s.siblings.failing} of ${s.siblings.total} other endpoint(s) on ${s.host} failing`,
    abnormal: s.siblings.total > 0 && s.siblings.failing > 0,
  });
  evidence.push({
    signal: "Fleet",
    finding: `${s.fleet.failingHosts} of ${s.fleet.otherHosts} other host(s) failing`,
    abnormal: fleetWide(s),
  });
  evidence.push({
    signal: "Configuration change",
    finding:
      s.configChangedMinutesBeforeOnset !== null
        ? `Endpoint configuration changed ${s.configChangedMinutesBeforeOnset} min before onset`
        : `No endpoint configuration change in the ${CONFIG_CHANGE_WINDOW_MIN} min before onset`,
    abnormal: s.configChangedMinutesBeforeOnset !== null,
  });

  return evidence;
}

function unlinkedIncidentReport(incident: Incident): RcaReport {
  return {
    incident_id: incident.id,
    incident_reference: incident.reference,
    generated_at: new Date().toISOString(),
    diagnosis: {
      category: incident.root_cause_category ?? "unknown",
      summary: incident.root_cause ?? "This incident isn't linked to a monitored endpoint, so there is no telemetry to analyze.",
      confidence: "low",
      scope: "endpoint",
    },
    evidence: [],
    recommendations: [
      {
        step: 1,
        title: `Link ${incident.service_name} to a monitored endpoint so it can be analyzed`,
        rationale: "Root cause analysis needs check history, probes and topology for the affected service.",
        action: "manual",
        params: {},
        risk: "low",
      },
    ],
    signals_unavailable: ["Endpoint check history", "Network probe", "Topology", "Kubernetes pod status"],
  };
}

// ---------- Helpers ----------

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "internal-service";
  }
}

// Cluster-internal names and private addresses are services we can act on
// with Kubernetes; anything else is a third-party host.
function isInternalHost(host: string): boolean {
  if (host === "localhost" || !host.includes(".")) return true;
  if (/\.(local|internal|svc|cluster\.local|corp|lan)$/.test(host)) return true;
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

// Best guess at the workload behind a host: the first DNS label, or the
// endpoint's name when the URL is an IP or localhost and carries no service name.
function deploymentName(s: Signals): string {
  const isAddress = s.host === "localhost" || /^[\d.]+$/.test(s.host) || s.host.includes(":");
  const base = isAddress ? s.endpoint.name : s.host.split(".")[0];
  return base.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function defaultNamespace(): string {
  return process.env.K8S_DEFAULT_NAMESPACE || "production-apps";
}

function errorCode(err: unknown): string {
  const e = err as { code?: string; message?: string };
  return e.code ?? e.message ?? "unknown error";
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(message), { code: "ETIMEOUT" })), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
