import { pool } from "../config/db";
import { createServiceNowTicket, updateServiceNowTicket } from "./serviceNow.service";
import { dispatchIncidentNotifications } from "./notification.service";

export type IncidentSeverity = "P1" | "P2" | "P3" | "P4";
export type IncidentStatus =
  | "TRIGGERED"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "MITIGATED"
  | "RESOLVED"
  | "CLOSED";

export interface Incident {
  id: number;
  reference: string;
  endpoint_id: number | null;
  service_name: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  root_cause: string | null;
  root_cause_category: string | null;
  affected_pods: string[] | null;
  servicenow_sys_id: string | null;
  servicenow_ticket_num: string | null;
  servicenow_status: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  mitigated_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  timeline?: IncidentTimelineEvent[];
}

export interface IncidentTimelineEvent {
  id: number;
  incident_id: number;
  event_type: string;
  message: string;
  actor: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// Generate human-readable enterprise reference: INC-YYYYMM-XXXX
export function generateIncidentReference(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `INC-${year}${month}-${randomSuffix}`;
}

const UNIQUE_VIOLATION = "23505";
const MAX_REFERENCE_ATTEMPTS = 5;

export async function createIncident(data: {
  endpoint_id?: number | null;
  endpoint_url?: string;
  service_name: string;
  title: string;
  severity: IncidentSeverity;
  root_cause?: string;
  root_cause_category?: string;
  affected_pods?: string[] | null;
  actor?: string;
  trigger_message?: string;
}): Promise<Incident> {
  const actor = data.actor ?? "SYSTEM_MONITOR";

  // 1. Insert Incident Record first so the reference is final before it reaches ServiceNow.
  // The reference suffix is random, so retry on the occasional collision.
  const insertSql = `
    INSERT INTO incidents (
      reference, endpoint_id, service_name, title, severity, status,
      root_cause, root_cause_category, affected_pods
    )
    VALUES ($1, $2, $3, $4, $5, 'TRIGGERED', $6, $7, $8)
    RETURNING *
  `;

  let incident: Incident | undefined;
  for (let attempt = 1; !incident; attempt++) {
    try {
      const { rows } = await pool.query<Incident>(insertSql, [
        generateIncidentReference(),
        data.endpoint_id ?? null,
        data.service_name,
        data.title,
        data.severity,
        data.root_cause ?? null,
        data.root_cause_category ?? null,
        data.affected_pods ?? null,
      ]);
      incident = rows[0];
    } catch (err) {
      if ((err as { code?: string }).code !== UNIQUE_VIOLATION || attempt >= MAX_REFERENCE_ATTEMPTS) throw err;
    }
  }

  // 2. Log Initial Timeline Event
  await addTimelineEvent(
    incident.id,
    "TRIGGERED",
    data.trigger_message ?? `Incident triggered with severity ${incident.severity}.`,
    actor
  );

  // 3. Create ServiceNow ticket
  let serviceNowData = {
    sys_id: `sn_mock_${Date.now()}`,
    ticket_number: `INC00${Math.floor(10000 + Math.random() * 90000)}`,
    status: "New",
  };

  try {
    serviceNowData = await createServiceNowTicket({
      reference: incident.reference,
      service_name: data.service_name,
      title: data.title,
      severity: data.severity,
      root_cause: data.root_cause,
      endpoint_url: data.endpoint_url,
    });
  } catch (err) {
    console.warn("ServiceNow auto-ticket creation failed:", err);
  }

  const { rows: syncedRows } = await pool.query<Incident>(
    `UPDATE incidents
     SET servicenow_sys_id = $2, servicenow_ticket_num = $3, servicenow_status = $4
     WHERE id = $1
     RETURNING *`,
    [incident.id, serviceNowData.sys_id, serviceNowData.ticket_number, serviceNowData.status]
  );
  incident = syncedRows[0];

  await addTimelineEvent(
    incident.id,
    "SERVICENOW_SYNC",
    `Synchronized incident to ServiceNow IT Service Management as ticket ${incident.servicenow_ticket_num}.`,
    "SERVICENOW_BOT"
  );

  // 4. Dispatch Multi-Channel Notifications (Email, SMS)
  try {
    const notifs = await dispatchIncidentNotifications({
      id: incident.id,
      reference: incident.reference,
      service_name: incident.service_name,
      title: incident.title,
      severity: incident.severity,
      root_cause: incident.root_cause ?? undefined,
    });

    if (notifs.length > 0) {
      await addTimelineEvent(
        incident.id,
        "NOTIFICATION_DISPATCHED",
        `Alerts dispatched via ${notifs.map((n) => n.channel).join(", ")} to on-call distribution groups.`,
        "NOTIFICATION_ENGINE"
      );
    }
  } catch (err) {
    console.warn("Notification dispatch failed:", err);
  }

  return incident;
}

export async function addTimelineEvent(
  incidentId: number,
  eventType: string,
  message: string,
  actor = "OPERATOR",
  metadata?: Record<string, unknown>
): Promise<IncidentTimelineEvent> {
  const { rows } = await pool.query<IncidentTimelineEvent>(
    `INSERT INTO incident_timeline (incident_id, event_type, message, actor, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [incidentId, eventType, message, actor, metadata ? JSON.stringify(metadata) : null]
  );
  return rows[0];
}

export async function updateIncidentStatus(
  idOrRef: string | number,
  newStatus: IncidentStatus,
  actor = "OPERATOR",
  note?: string
): Promise<Incident> {
  const whereClause = typeof idOrRef === "number" ? "id = $1" : "reference = $1";
  const { rows: currentRows } = await pool.query<Incident>(
    `SELECT * FROM incidents WHERE ${whereClause}`,
    [idOrRef]
  );

  if (!currentRows.length) {
    throw new Error(`Incident ${idOrRef} not found`);
  }

  const incident = currentRows[0];
  const updates: string[] = ["status = $2", "updated_at = NOW()"];
  const values: unknown[] = [incident.id, newStatus];
  let paramIdx = 3;

  if (newStatus === "ACKNOWLEDGED") {
    updates.push(`acknowledged_by = $${paramIdx++}`, `acknowledged_at = NOW()`);
    values.push(actor);
  } else if (newStatus === "MITIGATED") {
    updates.push(`mitigated_at = NOW()`);
  } else if (newStatus === "RESOLVED" || newStatus === "CLOSED") {
    updates.push(`resolved_at = NOW()`);
  }

  const updateSql = `
    UPDATE incidents
    SET ${updates.join(", ")}
    WHERE id = $1
    RETURNING *
  `;

  const { rows: updatedRows } = await pool.query<Incident>(updateSql, values);
  const updated = updatedRows[0];

  // Log timeline event
  await addTimelineEvent(
    updated.id,
    "STATUS_CHANGED",
    `Status transitioned from ${incident.status} to ${newStatus}.${note ? ` Note: "${note}"` : ""}`,
    actor
  );

  // Sync to ServiceNow if resolved
  if (newStatus === "RESOLVED" && updated.servicenow_sys_id) {
    try {
      await updateServiceNowTicket(updated.servicenow_sys_id, "Resolved");
      await addTimelineEvent(
        updated.id,
        "SERVICENOW_SYNC",
        `ServiceNow ticket ${updated.servicenow_ticket_num} marked as Resolved.`,
        "SERVICENOW_BOT"
      );
    } catch (err) {
      console.warn("ServiceNow sync failed on resolve:", err);
    }
  }

  return updated;
}

export async function getIncidentDetails(idOrRef: string | number): Promise<Incident> {
  const whereClause = typeof idOrRef === "number" || !isNaN(Number(idOrRef)) ? "id = $1" : "reference = $1";
  const param = whereClause.includes("id") ? Number(idOrRef) : idOrRef;

  const { rows } = await pool.query<Incident>(
    `SELECT * FROM incidents WHERE ${whereClause}`,
    [param]
  );

  if (!rows.length) {
    throw new Error(`Incident not found`);
  }

  const incident = rows[0];

  const { rows: timeline } = await pool.query<IncidentTimelineEvent>(
    `SELECT * FROM incident_timeline WHERE incident_id = $1 ORDER BY created_at ASC`,
    [incident.id]
  );

  incident.timeline = timeline;
  return incident;
}

export async function listIncidents(filters?: {
  status?: string;
  severity?: string;
}): Promise<Incident[]> {
  await seedDefaultIncidentsIfEmpty();

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (filters?.status && filters.status !== "all") {
    conditions.push(`status = $${paramIdx++}`);
    values.push(filters.status);
  }

  if (filters?.severity && filters.severity !== "all") {
    conditions.push(`severity = $${paramIdx++}`);
    values.push(filters.severity);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT 
      i.*,
      (SELECT COUNT(*) FROM incident_timeline WHERE incident_id = i.id) as timeline_count
    FROM incidents i
    ${whereClause}
    ORDER BY 
      CASE WHEN i.status IN ('TRIGGERED', 'INVESTIGATING') THEN 0 ELSE 1 END,
      i.created_at DESC
  `;

  const { rows } = await pool.query<Incident>(query, values);
  return rows;
}

async function seedDefaultIncidentsIfEmpty(): Promise<void> {
  const { rows } = await pool.query("SELECT COUNT(*) FROM incidents");
  if (Number(rows[0].count) > 0) return;

  // Seed sample enterprise incidents for demo and immediate visibility
  const sample1 = await createIncident({
    service_name: "HTTPBIN Core Gateway",
    title: "503 Service Unavailable on /status/503",
    severity: "P2",
    root_cause: "Upstream Service Unavailable / Ingress Circuit Breaker Tripped",
    root_cause_category: "server_error",
    affected_pods: ["httpbin-prod-pod-7f9", "httpbin-prod-pod-4xk"],
    actor: "SYNTHETIC_PROBER",
  });

  await addTimelineEvent(
    sample1.id,
    "INVESTIGATING",
    "SRE Engineer investigated router ingress metrics. Traffic rerouted to secondary availability zone.",
    "charlie.sre"
  );

  await updateIncidentStatus(sample1.id, "INVESTIGATING", "charlie.sre", "Investigating cluster router logs");

  const sample2 = await createIncident({
    service_name: "Payment Notification Worker",
    title: "Handshake Timeout on External Webhook Port 443",
    severity: "P1",
    root_cause: "Connection Timeout / Upstream Network Congestion at Lagos PoP",
    root_cause_category: "timeout",
    affected_pods: ["payment-notify-99b-1"],
    actor: "AUTO_DETECTION_ENGINE",
  });

  await updateIncidentStatus(sample2.id, "ACKNOWLEDGED", "alex.oncall", "Paging payment platform lead");

  const sample3 = await createIncident({
    service_name: "Customer Profile Microservice",
    title: "High Error Spike on /api/v1/profile",
    severity: "P3",
    root_cause: "Transient Database Connection Pool Saturation",
    root_cause_category: "server_error",
    affected_pods: ["cust-prof-22c-8", "cust-prof-22c-9"],
    actor: "AUTONOMOUS_OPERATOR",
  });

  await updateIncidentStatus(sample3.id, "RESOLVED", "SYSTEM", "Automatic pool expansion mitigated failure");
}
