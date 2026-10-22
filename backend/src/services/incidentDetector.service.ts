import { pool } from "../config/db";
import { Endpoint, MonitoringResult } from "../types";
import { classifyFailure, FailureCategory } from "./rootCause.service";
import { createIncident, updateIncidentStatus, Incident, IncidentSeverity } from "./incident.service";
import { analyzeAndPlan } from "./remediation.service";

// Read lazily — index.ts loads .env after its imports have already run.
function failureThreshold(): number {
  return Number(process.env.INCIDENT_FAILURE_THRESHOLD) || 3;
}

function recoveryThreshold(): number {
  return Number(process.env.INCIDENT_RECOVERY_THRESHOLD) || 2;
}

// Hard-down signals page as P2; client-side or unclassified failures are
// more often a config problem than an outage, so they open as P3.
const SEVERITY_BY_CATEGORY: Record<FailureCategory, IncidentSeverity> = {
  timeout: "P2",
  dns: "P2",
  connection_refused: "P2",
  connection_reset: "P2",
  server_error: "P2",
  client_error: "P3",
  unknown: "P3",
};

// A manual run and a scheduler tick can check the same endpoint at once;
// letting only one evaluate keeps them from both opening an incident. The
// skipped evaluation is picked up by the next check.
const inFlight = new Set<number>();

export async function evaluateIncidentState(endpoint: Endpoint): Promise<void> {
  if (inFlight.has(endpoint.id)) return;
  inFlight.add(endpoint.id);

  try {
    const open = await findOpenIncident(endpoint.id);
    if (open) {
      await resolveIfRecovered(open, endpoint);
    } else {
      await openIfFailing(endpoint);
    }
  } finally {
    inFlight.delete(endpoint.id);
  }
}

async function findOpenIncident(endpointId: number): Promise<Incident | null> {
  const { rows } = await pool.query<Incident>(
    `SELECT * FROM incidents
     WHERE endpoint_id = $1 AND status NOT IN ('RESOLVED', 'CLOSED')
     ORDER BY created_at DESC
     LIMIT 1`,
    [endpointId]
  );
  return rows[0] ?? null;
}

async function openIfFailing(endpoint: Endpoint): Promise<void> {
  const threshold = failureThreshold();

  // Only count checks since the endpoint's last incident was resolved, so an
  // operator resolving an incident doesn't get an instant duplicate from the
  // same failures — the endpoint has to fail `threshold` more times.
  const { rows: recent } = await pool.query<MonitoringResult>(
    `SELECT * FROM monitoring_results
     WHERE endpoint_id = $1
       AND created_at > COALESCE(
         (SELECT MAX(resolved_at) FROM incidents WHERE endpoint_id = $1),
         '-infinity'::timestamptz
       )
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [endpoint.id, threshold]
  );

  if (recent.length < threshold || recent.some((r) => r.status !== "down")) return;

  const latest = recent[0];
  const cause = classifyFailure(latest.status_code, latest.error_message);
  const symptom = latest.status_code !== null ? `HTTP ${latest.status_code}` : latest.error_message ?? "no response";
  const severity = SEVERITY_BY_CATEGORY[cause.category];

  const incident = await createIncident({
    endpoint_id: endpoint.id,
    endpoint_url: endpoint.url,
    service_name: endpoint.name,
    title: `${threshold} consecutive failed checks — ${symptom}`,
    severity,
    root_cause: cause.label,
    root_cause_category: cause.category,
    actor: "AUTO_DETECTION_ENGINE",
    trigger_message:
      `${endpoint.method} ${endpoint.url} failed ${threshold} consecutive health checks ` +
      `(latest: ${latest.error_message ?? symptom}). Incident triggered with severity ${severity}.`,
  });

  // The incident is already open and notified; a failed analysis only means
  // it keeps the initial classification and gets no remediation plan.
  try {
    await analyzeAndPlan(incident.id);
  } catch (err) {
    console.error(`Root cause analysis failed for incident ${incident.reference}:`, err);
  }
}

async function resolveIfRecovered(incident: Incident, endpoint: Endpoint): Promise<void> {
  const threshold = recoveryThreshold();

  const { rows: recent } = await pool.query<MonitoringResult>(
    `SELECT * FROM monitoring_results
     WHERE endpoint_id = $1 AND created_at > $2
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [endpoint.id, incident.created_at, threshold]
  );

  if (recent.length < threshold || recent.some((r) => r.status !== "up")) return;

  await updateIncidentStatus(
    incident.id,
    "RESOLVED",
    "AUTO_RECOVERY",
    `Endpoint passed ${threshold} consecutive health checks (latest ${recent[0].response_time}ms).`
  );
}
