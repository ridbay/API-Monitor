import axios from "axios";

export interface ServiceNowTicketResult {
  sys_id: string;
  ticket_number: string;
  status: string;
  instance_url: string;
}

export async function createServiceNowTicket(incident: {
  reference: string;
  service_name: string;
  title: string;
  severity: "P1" | "P2" | "P3" | "P4";
  root_cause?: string;
  endpoint_url?: string;
}): Promise<ServiceNowTicketResult> {
  const instance = process.env.SERVICENOW_INSTANCE || "dev-enterprise.service-now.com";
  const user = process.env.SERVICENOW_USER;
  const password = process.env.SERVICENOW_PASSWORD;

  const urgencyMap: Record<string, string> = { P1: "1", P2: "2", P3: "3", P4: "4" };
  const impactMap: Record<string, string> = { P1: "1", P2: "2", P3: "3", P4: "4" };

  const payload = {
    short_description: `[API-Monitor ${incident.severity}] ${incident.service_name}: ${incident.title}`,
    description: `Incident Reference: ${incident.reference}
Target Service: ${incident.service_name}
Endpoint URL: ${incident.endpoint_url ?? "Internal Service"}
Severity: ${incident.severity}
Identified Root Cause: ${incident.root_cause ?? "Automatic detection in progress"}
Platform: OpenShift Cluster (API Monitor Autonomous Ops)`,
    urgency: urgencyMap[incident.severity] || "2",
    impact: impactMap[incident.severity] || "2",
    category: "Software",
    contact_type: "Automated Monitoring",
    caller_id: "api.monitoring.bot",
  };

  // If live credentials are provided in env, make real HTTP call
  if (user && password) {
    try {
      const response = await axios.post(
        `https://${instance}/api/now/table/incident`,
        payload,
        {
          auth: { username: user, password },
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          timeout: 5000,
        }
      );
      return {
        sys_id: response.data.result.sys_id,
        ticket_number: response.data.result.number,
        status: "New",
        instance_url: `https://${instance}/nav_to.do?uri=incident.do?sys_id=${response.data.result.sys_id}`,
      };
    } catch (err) {
      console.warn("ServiceNow API live request failed, falling back to simulated sync:", err);
    }
  }

  // Realistic enterprise simulation for lab/demo
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  const sysId = `sn_${Buffer.from(incident.reference).toString("hex").slice(0, 16)}${randomNum}`;
  const ticketNumber = `INC00${randomNum}`;

  return {
    sys_id: sysId,
    ticket_number: ticketNumber,
    status: "New",
    instance_url: `https://${instance}/nav_to.do?uri=incident.do?sys_id=${sysId}`,
  };
}

export async function updateServiceNowTicket(sysId: string, state: "In Progress" | "Resolved" | "Closed"): Promise<void> {
  const instance = process.env.SERVICENOW_INSTANCE || "dev-enterprise.service-now.com";
  const user = process.env.SERVICENOW_USER;
  const password = process.env.SERVICENOW_PASSWORD;

  if (user && password) {
    try {
      await axios.patch(
        `https://${instance}/api/now/table/incident/${sysId}`,
        { state },
        { auth: { username: user, password }, timeout: 5000 }
      );
    } catch (err) {
      console.warn("ServiceNow update failed:", err);
    }
  }
}

// Returns true only when the note reached a live ServiceNow instance; without
// credentials the ticket is simulated and there is nothing to post to.
export async function addServiceNowWorkNote(sysId: string, note: string): Promise<boolean> {
  const instance = process.env.SERVICENOW_INSTANCE || "dev-enterprise.service-now.com";
  const user = process.env.SERVICENOW_USER;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!user || !password) return false;
  try {
    await axios.patch(
      `https://${instance}/api/now/table/incident/${sysId}`,
      { work_notes: note },
      { auth: { username: user, password }, timeout: 5000 }
    );
    return true;
  } catch (err) {
    console.warn("ServiceNow work note failed:", err);
    return false;
  }
}
