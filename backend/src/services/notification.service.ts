import { pool } from "../config/db";

export interface NotificationLog {
  id: number;
  incident_id: number;
  channel: "EMAIL" | "SMS" | "SERVICENOW" | "SLACK" | "TEAMS";
  recipient: string;
  subject: string | null;
  content: string;
  status: "SENT" | "FAILED" | "QUEUED";
  created_at: string;
}

export interface NotificationConfig {
  id: number;
  name: string;
  channel: "EMAIL" | "SMS" | "SERVICENOW" | "SLACK" | "TEAMS";
  destination: string;
  min_severity: "P1" | "P2" | "P3" | "P4";
  is_active: boolean;
  created_at: string;
}

// Memory cache for anti-flapping / alert storm suppression (10-minute window)
const alertSuppressionMap = new Map<string, number>();

export async function ensureDefaultConfigs(): Promise<void> {
  const { rows } = await pool.query("SELECT COUNT(*) FROM notification_configs");
  if (Number(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO notification_configs (name, channel, destination, min_severity, is_active)
      VALUES 
        ('SRE Core Engineering Group', 'EMAIL', 'sre-oncall@mtn.corp', 'P3', true),
        ('Enterprise Operations DL', 'EMAIL', 'operations-alerts@company.internal', 'P2', true),
        ('Emergency P1 On-Call SMS', 'SMS', '+2348030009988', 'P1', true),
        ('ServiceNow IT Service Management', 'SERVICENOW', 'https://dev-enterprise.service-now.com', 'P2', true),
        ('Critical Incident Slack Webhook', 'SLACK', '#incidents-critical', 'P2', true)
    `);
  }
}

const SEVERITY_LEVELS: Record<string, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

export async function dispatchIncidentNotifications(incident: {
  id: number;
  reference: string;
  service_name: string;
  title: string;
  severity: "P1" | "P2" | "P3" | "P4";
  root_cause?: string;
}): Promise<NotificationLog[]> {
  await ensureDefaultConfigs();

  // Check alert storm / flapping suppression
  const suppressionKey = `${incident.service_name}:${incident.severity}`;
  const lastAlertTime = alertSuppressionMap.get(suppressionKey);
  const now = Date.now();

  if (lastAlertTime && now - lastAlertTime < 5 * 60 * 1000) {
    console.log(`Alert suppression active for ${suppressionKey} (flapping prevented)`);
    return [];
  }
  alertSuppressionMap.set(suppressionKey, now);

  const { rows: configs } = await pool.query<NotificationConfig>(
    "SELECT * FROM notification_configs WHERE is_active = true"
  );

  const dispatched: NotificationLog[] = [];
  const incidentSevWeight = SEVERITY_LEVELS[incident.severity] || 4;

  for (const cfg of configs) {
    const configSevWeight = SEVERITY_LEVELS[cfg.min_severity] || 4;
    // Only trigger if incident severity is at or higher than config minimum (P1 is highest, weight 1)
    if (incidentSevWeight > configSevWeight) {
      continue;
    }

    let subject = `[${incident.severity} CRITICAL] ${incident.service_name} Incident Alert — ${incident.reference}`;
    let content = "";

    if (cfg.channel === "EMAIL") {
      content = `Attention: ${cfg.name}
An automated incident has been triggered for microservice "${incident.service_name}".
Reference: ${incident.reference}
Severity: ${incident.severity}
Issue: ${incident.title}
Identified Root Cause: ${incident.root_cause || "Auto-detection underway"}
Dashboard Link: http://localhost:8088/incidents/${incident.reference}`;
    } else if (cfg.channel === "SMS") {
      subject = null as unknown as string;
      content = `[P1 ALERT] ${incident.service_name} DOWN (${incident.reference}). Root cause: ${incident.root_cause || "Unreachable"}. Immediate on-call action required.`;
    } else if (cfg.channel === "SERVICENOW") {
      content = `Automated Incident Logged to ServiceNow Table API. Ref: ${incident.reference}`;
    } else {
      content = `🚨 *${incident.severity} Incident:* \`${incident.reference}\` on service *${incident.service_name}*. Reason: ${incident.title}`;
    }

    const { rows: inserted } = await pool.query<NotificationLog>(
      `INSERT INTO notification_logs (incident_id, channel, recipient, subject, content, status)
       VALUES ($1, $2, $3, $4, $5, 'SENT')
       RETURNING *`,
      [incident.id, cfg.channel, cfg.destination, subject, content]
    );

    if (inserted[0]) {
      dispatched.push(inserted[0]);
    }
  }

  return dispatched;
}

export async function getNotificationLogs(incidentId?: number): Promise<NotificationLog[]> {
  if (incidentId) {
    const { rows } = await pool.query<NotificationLog>(
      "SELECT * FROM notification_logs WHERE incident_id = $1 ORDER BY created_at DESC",
      [incidentId]
    );
    return rows;
  }
  const { rows } = await pool.query<NotificationLog>(
    "SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 50"
  );
  return rows;
}

export async function getNotificationConfigs(): Promise<NotificationConfig[]> {
  await ensureDefaultConfigs();
  const { rows } = await pool.query<NotificationConfig>(
    "SELECT * FROM notification_configs ORDER BY id ASC"
  );
  return rows;
}
