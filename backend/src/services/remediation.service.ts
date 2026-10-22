import { pool } from "../config/db";
import { HttpError } from "../middleware/errorHandler";
import { endpointRepository } from "../repositories/endpoint.repository";
import { INTERVAL_MS, MonitoringInterval, MonitoringResult } from "../types";
import { addTimelineEvent, getIncidentDetails, Incident, updateIncidentStatus } from "./incident.service";
import { executeCheck } from "./monitoring.service";
import { analyzeIncident, RcaReport, RemediationAction, RemediationRisk } from "./rcaEngine.service";
import { addServiceNowWorkNote } from "./serviceNow.service";
import { kubernetesStatus, rolloutRestartDeployment, scaleDeployment } from "./kubernetesRunner.service";
import { runTraceroute } from "./traceroute.service";

export type PlanStatus = "PENDING" | "EXECUTING" | "SUCCEEDED" | "FAILED" | "COMPLETED" | "REJECTED" | "SUPERSEDED";

export interface RemediationPlan {
  id: number;
  reference: string;
  incident_id: number;
  rca_report_id: number | null;
  step: number;
  title: string;
  rationale: string | null;
  action: RemediationAction;
  params: Record<string, unknown>;
  risk: RemediationRisk;
  requires: string | null;
  status: PlanStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  auto_executed: boolean;
  executed_at: string | null;
  result: Record<string, unknown> | null;
  verification: "recovered" | "still_failing" | null;
  created_at: string;
  updated_at: string;
  audit?: RemediationAuditEntry[];
}

export interface RemediationAuditEntry {
  id: number;
  plan_id: number;
  incident_id: number;
  event: string;
  actor: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface AutopilotPolicy {
  action: RemediationAction;
  enabled: boolean;
  eligible: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

interface ExecutionOutcome {
  result: Record<string, unknown>;
  // Endpoint to re-probe afterwards, and how long to wait first (pods need
  // time to roll before a probe means anything).
  verify?: { endpointId: number; delayMs: number };
  // A re-probe's own check is already the verification.
  verification?: "recovered" | "still_failing";
}

type Executor = (params: Record<string, unknown>) => Promise<ExecutionOutcome>;

const K8S_VERIFY_DELAY_MS = 60_000;
const OPEN_INCIDENT = ["TRIGGERED", "ACKNOWLEDGED", "INVESTIGATING"];
// Identities the system writes under; a human approver can't claim them.
const RESERVED_ACTORS = new Set([
  "SYSTEM", "AUTOPILOT", "RCA_ENGINE", "REMEDIATION_ENGINE", "AUTO_RECOVERY",
  "AUTO_DETECTION_ENGINE", "SYSTEM_MONITOR", "SERVICENOW_BOT", "NOTIFICATION_ENGINE",
]);
// Steps that only gather information; a good result from them doesn't mean anything was fixed.
const DIAGNOSTIC_ACTIONS = new Set<RemediationAction>(["reprobe", "run_traceroute"]);

const EXECUTORS: Partial<Record<RemediationAction, Executor>> = {
  async reprobe(params) {
    const latest = await checkEndpoint(endpointIdParam(params));
    return {
      result: { status: latest.status, status_code: latest.status_code, response_time: latest.response_time, error: latest.error_message },
      verification: latest.status === "up" ? "recovered" : "still_failing",
    };
  },

  async run_traceroute(params) {
    const trace = await runTraceroute(endpointIdParam(params));
    return {
      result: { status: trace.status, summary: trace.summary, dns_ms: trace.dnsLookupMs, total_latency_ms: trace.totalLatencyMs },
    };
  },

  async update_endpoint_timeout(params) {
    const endpointId = endpointIdParam(params);
    const timeout = Number(params.timeout);
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60_000) {
      throw new Error(`Timeout must be an integer between 100 and 60000 ms (got ${params.timeout})`);
    }
    const before = await requireEndpoint(endpointId);
    await endpointRepository.update(endpointId, { timeout });
    return { result: { from: before.timeout, to: timeout }, verify: { endpointId, delayMs: 0 } };
  },

  async reduce_check_frequency(params) {
    const endpointId = endpointIdParam(params);
    const interval = String(params.interval) as MonitoringInterval;
    if (!(interval in INTERVAL_MS)) throw new Error(`Unknown interval "${params.interval}"`);
    const before = await requireEndpoint(endpointId);
    await endpointRepository.update(endpointId, { interval });
    return { result: { from: before.interval, to: interval }, verify: { endpointId, delayMs: 0 } };
  },

  async rollout_restart(params) {
    const result = await rolloutRestartDeployment(String(params.namespace), String(params.deployment));
    return { result };
  },

  async scale_deployment(params) {
    const result = await scaleDeployment(String(params.namespace), String(params.deployment), Number(params.delta ?? 1));
    return { result };
  },
};

const ACTION_RISK: Record<RemediationAction, RemediationRisk> = {
  reprobe: "low",
  run_traceroute: "low",
  reduce_check_frequency: "low",
  update_endpoint_timeout: "medium",
  rollout_restart: "high",
  scale_deployment: "high",
  manual: "low",
};

// ---------- Planning ----------

// Runs RCA and turns its runbook into plans awaiting approval.
export async function analyzeAndPlan(incidentRef: number | string): Promise<{ report: RcaReport; plans: RemediationPlan[] }> {
  const report = await analyzeIncident(incidentRef);
  const plans = await createPlansFromReport(report);
  return { report, plans };
}

async function createPlansFromReport(report: RcaReport): Promise<RemediationPlan[]> {
  const incident = await getIncidentDetails(report.incident_id);

  const { rows: superseded } = await pool.query<RemediationPlan>(
    `UPDATE remediation_plans SET status = 'SUPERSEDED', updated_at = NOW()
     WHERE incident_id = $1 AND status = 'PENDING' RETURNING *`,
    [incident.id]
  );
  for (const plan of superseded) await audit(plan, "SUPERSEDED", "RCA_ENGINE", { by_report: report.report_id });

  const plans: RemediationPlan[] = [];
  for (const rec of report.recommendations) {
    const { rows } = await pool.query<RemediationPlan>(
      `INSERT INTO remediation_plans (incident_id, rca_report_id, step, title, rationale, action, params, risk, requires)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [incident.id, report.report_id ?? null, rec.step, rec.title, rec.rationale, rec.action,
        JSON.stringify(rec.params), rec.risk, rec.requires ?? null]
    );
    plans.push(rows[0]);
    await audit(rows[0], "PLANNED", "RCA_ENGINE", { action: rec.action, params: rec.params, risk: rec.risk });
  }
  if (!plans.length) return plans;

  const listing = plans.map((p) => `${p.reference} (${p.action}, ${p.risk} risk)`).join(", ");
  await addTimelineEvent(
    incident.id,
    "REMEDIATION_PLANNED",
    `${plans.length} remediation step(s) proposed and awaiting approval: ${listing}.`,
    "REMEDIATION_ENGINE"
  );
  await postToServiceNow(incident, `Remediation plan for ${incident.reference} awaiting approval:\n` +
    plans.map((p) => `${p.reference}: ${p.title} [${p.risk} risk]`).join("\n"));

  return runAutopilot(plans);
}

async function runAutopilot(plans: RemediationPlan[]): Promise<RemediationPlan[]> {
  const enabled = new Set((await listAutopilotPolicies()).filter((p) => p.enabled && p.eligible).map((p) => p.action));
  const out: RemediationPlan[] = [];
  for (const plan of plans) {
    if (!enabled.has(plan.action) || plan.risk !== "low" || availability(plan).ok === false) {
      out.push(plan);
      continue;
    }
    const claimed = await claimForExecution(plan.reference, "AUTOPILOT", "Autopilot policy", true);
    out.push(claimed ? await execute(claimed, "AUTOPILOT") : plan);
  }
  return out;
}

// ---------- Decisions ----------

export async function approvePlan(reference: string, actor: string, note?: string): Promise<RemediationPlan> {
  const approver = validateActor(actor);
  const plan = await requirePlan(reference);
  await assertDecidable(plan);

  const available = availability(plan);
  if (!available.ok) throw new DecisionError(available.reason!);

  if (plan.action === "manual") {
    const { rows } = await pool.query<RemediationPlan>(
      `UPDATE remediation_plans
       SET status = 'COMPLETED', decided_by = $2, decided_at = NOW(), decision_note = $3, updated_at = NOW()
       WHERE reference = $1 AND status = 'PENDING' RETURNING *`,
      [reference, approver, note ?? null]
    );
    if (!rows.length) throw new DecisionError(`${reference} is no longer pending`);
    await audit(rows[0], "COMPLETED", approver, { note });
    await addTimelineEvent(plan.incident_id, "REMEDIATION_COMPLETED", `${reference} marked done: ${plan.title}.`, approver);
    return rows[0];
  }

  const claimed = await claimForExecution(reference, approver, note, false);
  if (!claimed) throw new DecisionError(`${reference} is no longer pending`);
  return execute(claimed, approver);
}

export async function rejectPlan(reference: string, actor: string, note?: string): Promise<RemediationPlan> {
  const approver = validateActor(actor);
  const plan = await requirePlan(reference);
  const { rows } = await pool.query<RemediationPlan>(
    `UPDATE remediation_plans
     SET status = 'REJECTED', decided_by = $2, decided_at = NOW(), decision_note = $3, updated_at = NOW()
     WHERE reference = $1 AND status = 'PENDING' RETURNING *`,
    [reference, approver, note ?? null]
  );
  if (!rows.length) throw new DecisionError(`${reference} is ${plan.status.toLowerCase()}, not pending`);
  await audit(rows[0], "REJECTED", approver, { note });
  await addTimelineEvent(
    plan.incident_id,
    "REMEDIATION_REJECTED",
    `${reference} rejected: ${plan.title}.${note ? ` Reason: "${note}"` : ""}`,
    approver
  );
  return rows[0];
}

// The conditional UPDATE is what stops two simultaneous approvals from both
// executing the same plan: only one of them gets the row back.
async function claimForExecution(reference: string, actor: string, note: string | undefined, auto: boolean) {
  const { rows } = await pool.query<RemediationPlan>(
    `UPDATE remediation_plans
     SET status = 'EXECUTING', decided_by = $2, decided_at = NOW(), decision_note = $3, auto_executed = $4, updated_at = NOW()
     WHERE reference = $1 AND status = 'PENDING' RETURNING *`,
    [reference, actor, note ?? null, auto]
  );
  if (rows[0]) await audit(rows[0], auto ? "AUTOPILOT_APPROVED" : "APPROVED", actor, { note });
  return rows[0] ?? null;
}

// ---------- Execution & verification ----------

async function execute(plan: RemediationPlan, actor: string): Promise<RemediationPlan> {
  const executor = EXECUTORS[plan.action]!;
  let outcome: ExecutionOutcome;
  try {
    outcome = await executor(plan.params);
  } catch (err) {
    const error = (err as Error).message;
    const failed = await finish(plan.id, "FAILED", { error }, null);
    await audit(failed, "EXECUTION_FAILED", actor, { error });
    await addTimelineEvent(plan.incident_id, "REMEDIATION_FAILED", `${plan.reference} (${plan.action}) failed: ${error}`, "REMEDIATION_ENGINE");
    return failed;
  }

  const done = await finish(plan.id, "SUCCEEDED", outcome.result, outcome.verification ?? null);
  await audit(done, "EXECUTED", actor, outcome.result);
  await addTimelineEvent(
    plan.incident_id,
    "REMEDIATION_EXECUTED",
    `${plan.reference} executed${actor === "AUTOPILOT" ? " by autopilot" : ""}: ${plan.title}.` +
      (outcome.verification ? ` Endpoint is ${outcome.verification === "recovered" ? "UP" : "still DOWN"}.` : ""),
    actor,
    outcome.result
  );

  if (outcome.verify) {
    const { endpointId, delayMs } = outcome.verify;
    if (delayMs === 0) return verify(done, endpointId);
    // In-process timer: a restart in this window skips the follow-up probe,
    // but the scheduler's regular checks still pick up recovery.
    setTimeout(() => verify(done, endpointId).catch((e) => console.error(`Verification of ${done.reference} failed:`, e)), delayMs);
  } else if (plan.requires === "kubernetes") {
    const endpointId = await incidentEndpointId(plan.incident_id);
    if (endpointId) {
      setTimeout(
        () => verify(done, endpointId).catch((e) => console.error(`Verification of ${done.reference} failed:`, e)),
        K8S_VERIFY_DELAY_MS
      );
    }
  }
  return done;
}

async function verify(plan: RemediationPlan, endpointId: number): Promise<RemediationPlan> {
  const latest = await checkEndpoint(endpointId);
  const verification = latest.status === "up" ? "recovered" : "still_failing";
  const { rows } = await pool.query<RemediationPlan>(
    `UPDATE remediation_plans SET verification = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [plan.id, verification]
  );
  await audit(rows[0], "VERIFIED", "REMEDIATION_ENGINE", { verification, status_code: latest.status_code, response_time: latest.response_time });
  await addTimelineEvent(
    plan.incident_id,
    "REMEDIATION_VERIFIED",
    `Post-remediation probe after ${plan.reference}: endpoint is ${verification === "recovered" ? "UP" : "still DOWN"}` +
      ` (${latest.status_code ?? latest.error_message ?? "no response"}, ${latest.response_time}ms).`,
    "REMEDIATION_ENGINE"
  );

  if (verification === "recovered" && !DIAGNOSTIC_ACTIONS.has(plan.action)) {
    const incident = await getIncidentDetails(plan.incident_id);
    if (OPEN_INCIDENT.includes(incident.status)) {
      await updateIncidentStatus(incident.id, "MITIGATED", "REMEDIATION_ENGINE", `Endpoint recovered after ${plan.reference}.`);
    }
  }
  return rows[0];
}

async function finish(planId: number, status: PlanStatus, result: Record<string, unknown>, verification: string | null) {
  const { rows } = await pool.query<RemediationPlan>(
    `UPDATE remediation_plans SET status = $2, result = $3, verification = $4, executed_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [planId, status, JSON.stringify(result), verification]
  );
  return rows[0];
}

// ---------- Queries ----------

export async function listPlans(filters: { incidentId?: number; status?: string } = {}): Promise<RemediationPlan[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.incidentId) {
    values.push(filters.incidentId);
    conditions.push(`incident_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  const { rows } = await pool.query<RemediationPlan>(
    `SELECT * FROM remediation_plans ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY created_at DESC, step ASC`,
    values
  );
  return rows;
}

export async function getPlan(reference: string): Promise<RemediationPlan> {
  const plan = await requirePlan(reference);
  const { rows } = await pool.query<RemediationAuditEntry>(
    `SELECT * FROM remediation_audit WHERE plan_id = $1 ORDER BY created_at ASC, id ASC`,
    [plan.id]
  );
  return { ...plan, audit: rows };
}

export async function listAudit(incidentId?: number): Promise<RemediationAuditEntry[]> {
  const { rows } = await pool.query<RemediationAuditEntry>(
    `SELECT * FROM remediation_audit ${incidentId ? "WHERE incident_id = $1" : ""} ORDER BY created_at DESC, id DESC LIMIT 200`,
    incidentId ? [incidentId] : []
  );
  return rows;
}

// ---------- Autopilot ----------

function autopilotEligible(action: RemediationAction): boolean {
  return action !== "manual" && ACTION_RISK[action] === "low";
}

export async function listAutopilotPolicies(): Promise<AutopilotPolicy[]> {
  const { rows } = await pool.query<{ action: RemediationAction; enabled: boolean; updated_by: string; updated_at: string }>(
    `SELECT * FROM autopilot_policies`
  );
  const stored = new Map(rows.map((r) => [r.action, r]));
  return (Object.keys(ACTION_RISK) as RemediationAction[])
    .filter((action) => action !== "manual")
    .map((action) => ({
      action,
      enabled: stored.get(action)?.enabled ?? false,
      eligible: autopilotEligible(action),
      updated_by: stored.get(action)?.updated_by ?? null,
      updated_at: stored.get(action)?.updated_at ?? null,
    }));
}

export async function setAutopilotPolicy(action: string, enabled: boolean, actor: string): Promise<AutopilotPolicy[]> {
  const admin = validateActor(actor);
  if (!(action in ACTION_RISK) || action === "manual") throw new DecisionError(`Unknown action "${action}"`);
  if (enabled && !autopilotEligible(action as RemediationAction)) {
    throw new DecisionError(`${action} is ${ACTION_RISK[action as RemediationAction]} risk; only low-risk actions can run on autopilot`);
  }
  await pool.query(
    `INSERT INTO autopilot_policies (action, enabled, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (action) DO UPDATE SET enabled = $2, updated_by = $3, updated_at = NOW()`,
    [action, enabled, admin]
  );
  return listAutopilotPolicies();
}

// ---------- Helpers ----------

export class DecisionError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

function availability(plan: RemediationPlan): { ok: boolean; reason?: string } {
  if (plan.action === "manual") return { ok: true };
  if (!EXECUTORS[plan.action]) return { ok: false, reason: `No executor for action "${plan.action}"` };
  if (plan.requires === "kubernetes") {
    const k8s = kubernetesStatus();
    if (!k8s.enabled) return { ok: false, reason: k8s.reason };
  }
  return { ok: true };
}

async function assertDecidable(plan: RemediationPlan) {
  if (plan.status !== "PENDING") throw new DecisionError(`${plan.reference} is ${plan.status.toLowerCase()}, not pending`);
  const incident = await getIncidentDetails(plan.incident_id);
  if (incident.status === "RESOLVED" || incident.status === "CLOSED") {
    throw new DecisionError(`${incident.reference} is already ${incident.status.toLowerCase()}; ${plan.reference} no longer applies`);
  }
}

function validateActor(actor: string | undefined): string {
  const name = (actor ?? "").trim();
  if (name.length < 2 || name.length > 64) throw new DecisionError("An approver name (2-64 characters) is required");
  if (RESERVED_ACTORS.has(name.toUpperCase())) throw new DecisionError(`"${name}" is a reserved system identity`);
  return name;
}

async function requirePlan(reference: string): Promise<RemediationPlan> {
  const { rows } = await pool.query<RemediationPlan>(`SELECT * FROM remediation_plans WHERE reference = $1`, [reference.toUpperCase()]);
  if (!rows.length) throw new HttpError(404, `Remediation plan ${reference} not found`);
  return rows[0];
}

async function requireEndpoint(endpointId: number) {
  const endpoint = await endpointRepository.findById(endpointId);
  if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`);
  return endpoint;
}

function endpointIdParam(params: Record<string, unknown>): number {
  const id = Number(params.endpoint_id);
  if (!Number.isInteger(id)) throw new Error("Plan has no endpoint_id");
  return id;
}

async function checkEndpoint(endpointId: number): Promise<MonitoringResult> {
  await executeCheck(await requireEndpoint(endpointId));
  const { rows } = await pool.query<MonitoringResult>(
    `SELECT * FROM monitoring_results WHERE endpoint_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [endpointId]
  );
  return rows[0];
}

async function incidentEndpointId(incidentId: number): Promise<number | null> {
  const { rows } = await pool.query<{ endpoint_id: number | null }>(`SELECT endpoint_id FROM incidents WHERE id = $1`, [incidentId]);
  return rows[0]?.endpoint_id ?? null;
}

async function audit(plan: RemediationPlan, event: string, actor: string, detail?: Record<string, unknown>) {
  await pool.query(
    `INSERT INTO remediation_audit (plan_id, incident_id, event, actor, detail) VALUES ($1, $2, $3, $4, $5)`,
    [plan.id, plan.incident_id, event, actor, detail ? JSON.stringify(detail) : null]
  );
}

async function postToServiceNow(incident: Incident, note: string) {
  if (!incident.servicenow_sys_id) return;
  const live = await addServiceNowWorkNote(incident.servicenow_sys_id, note);
  await addTimelineEvent(
    incident.id,
    "SERVICENOW_SYNC",
    live
      ? `Remediation plan posted to ServiceNow ticket ${incident.servicenow_ticket_num} as a work note.`
      : `Remediation plan not posted to ServiceNow ticket ${incident.servicenow_ticket_num} (simulated — no ServiceNow credentials).`,
    "SERVICENOW_BOT"
  );
}
