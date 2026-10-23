import "./helpers/setup";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import net from "net";
import { pool, prepareDatabase, resetDatabase } from "./helpers/db";
import { addHistory, check, closedPort, createEndpoint, incidentsFor, startStub } from "./helpers/fixtures";
import {
  analyzeAndPlan,
  approvePlan,
  getPlan,
  listAutopilotPolicies,
  listPlans,
  rejectPlan,
  RemediationPlan,
  setAutopilotPolicy,
} from "../src/services/remediation.service";
import { updateIncidentStatus } from "../src/services/incident.service";
import { executeTool } from "../src/services/chatTools";
import { Endpoint } from "../src/types";

async function failInto(ep: Endpoint) {
  await check(ep, 3);
  const [incident] = await incidentsFor(ep.id);
  const plans = (await listPlans({ incidentId: incident.id })).sort((a, b) => a.step - b.step);
  return { incident, plans };
}

const pending = (plans: RemediationPlan[], action: string) => {
  const plan = plans.find((p) => p.action === action && p.status === "PENDING");
  assert.ok(plan, `pending ${action} plan`);
  return plan!;
};

interface K8sCall { method: string; url: string; contentType?: string; auth?: string; body: any }

// Minimal stand-in for the Kubernetes API: records calls, serves /scale.
async function startMockK8s() {
  const calls: K8sCall[] = [];
  const state = { forbidden: false };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      calls.push({ method: req.method!, url: req.url!, contentType: req.headers["content-type"], auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
      res.setHeader("Content-Type", "application/json");
      if (state.forbidden) {
        res.statusCode = 403;
        res.end(JSON.stringify({ message: "deployments.apps is forbidden" }));
      } else if (req.method === "GET" && req.url!.endsWith("/scale")) {
        res.end(JSON.stringify({ spec: { replicas: 3 } }));
      } else {
        res.end("{}");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`,
    calls,
    state,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe("remediation decision layer", () => {
  let stub: Awaited<ReturnType<typeof startStub>>;
  let k8s: Awaited<ReturnType<typeof startMockK8s>>;

  before(async () => {
    await prepareDatabase();
    stub = await startStub();
    k8s = await startMockK8s();
  });
  beforeEach(async () => {
    await resetDatabase();
    for (const key of Object.keys(stub.routes)) delete stub.routes[key];
    k8s.calls.length = 0;
    k8s.state.forbidden = false;
  });
  afterEach(() => {
    process.env.K8S_REMEDIATION_ENABLED = "";
  });
  after(async () => {
    await stub.close();
    await k8s.close();
    await pool.end();
  });

  async function timeoutScenario() {
    stub.routes["/slow"] = { status: 200, delayMs: 400 };
    const ep = await createEndpoint(`${stub.base}/slow`, { timeout: 300 });
    await addHistory(ep.id, Array.from({ length: 10 }, (_, i) => ({ minsAgo: 120 + i * 40, ms: 250 + i * 3 })));
    return { ep, ...(await failInto(ep)) };
  }

  it("turns RCA steps into pending REC-XXXX plans", async () => {
    const { plans } = await timeoutScenario();
    assert.deepEqual(plans.map((p) => [p.reference, p.action, p.risk, p.status]), [
      ["REC-0001", "update_endpoint_timeout", "medium", "PENDING"],
      ["REC-0002", "reprobe", "low", "PENDING"],
    ]);
  });

  it("approve → execute → verify → mitigate, with a full audit trail", async () => {
    const { ep, incident, plans } = await timeoutScenario();
    const fix = pending(plans, "update_endpoint_timeout");

    const done = await approvePlan(fix.reference, "alice.sre", "raise per RCA");
    assert.equal(done.status, "SUCCEEDED");
    assert.equal(done.decided_by, "alice.sre");
    assert.equal(done.verification, "recovered");
    assert.deepEqual(done.result, { from: 300, to: 1000 });

    const { rows: [after] } = await pool.query(`SELECT timeout FROM endpoints WHERE id = $1`, [ep.id]);
    assert.equal(after.timeout, 1000);
    assert.equal((await incidentsFor(ep.id))[0].status, "MITIGATED");

    const audit = (await getPlan(fix.reference)).audit!.map((a) => `${a.event}:${a.actor}`);
    assert.deepEqual(audit, ["PLANNED:RCA_ENGINE", "APPROVED:alice.sre", "EXECUTED:alice.sre", "VERIFIED:REMEDIATION_ENGINE"]);
    assert.ok(incident.id);
  });

  it("requires a real approver name", async () => {
    const { plans } = await timeoutScenario();
    const fix = pending(plans, "update_endpoint_timeout");
    await assert.rejects(approvePlan(fix.reference, ""), /approver name/);
    await assert.rejects(approvePlan(fix.reference, "autopilot"), /reserved/);
    await assert.rejects(rejectPlan(fix.reference, " x "), /approver name/);
  });

  it("refuses to decide a plan twice", async () => {
    const { plans } = await timeoutScenario();
    const fix = pending(plans, "update_endpoint_timeout");
    await approvePlan(fix.reference, "alice.sre");
    await assert.rejects(approvePlan(fix.reference, "bob.sre"), /succeeded, not pending/);
    await assert.rejects(rejectPlan(fix.reference, "bob.sre"), /succeeded, not pending/);
  });

  it("executes a plan once when approved twice at the same moment", async () => {
    const { plans } = await timeoutScenario();
    const reprobe = pending(plans, "reprobe");
    const results = await Promise.allSettled([approvePlan(reprobe.reference, "alice.sre"), approvePlan(reprobe.reference, "bob.sre")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  });

  it("records a rejection with its reason", async () => {
    const { incident, plans } = await timeoutScenario();
    const fix = pending(plans, "update_endpoint_timeout");
    const rejected = await rejectPlan(fix.reference, "alice.sre", "change freeze");
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.decision_note, "change freeze");
    const { rows } = await pool.query(`SELECT message FROM incident_timeline WHERE incident_id = $1 AND event_type = 'REMEDIATION_REJECTED'`, [incident.id]);
    assert.match(rows[0].message, /change freeze/);
  });

  it("marks manual steps done without executing anything", async () => {
    stub.routes["/a"] = { status: 401 };
    const { plans } = await failInto(await createEndpoint(`${stub.base}/a`));
    const manual = pending(plans, "manual");
    const done = await approvePlan(manual.reference, "alice.sre");
    assert.equal(done.status, "COMPLETED");
    assert.equal(done.executed_at, null);
  });

  it("blocks Kubernetes actions while no cluster is configured", async () => {
    const { plans } = await failInto(await createEndpoint(`http://127.0.0.1:${await closedPort()}/health`));
    const restart = pending(plans, "rollout_restart");
    await assert.rejects(approvePlan(restart.reference, "alice.sre"), /disabled/);
    assert.equal((await getPlan(restart.reference)).status, "PENDING");
  });

  it("rollout-restarts through the Kubernetes API", async () => {
    Object.assign(process.env, { K8S_REMEDIATION_ENABLED: "true", K8S_API_URL: k8s.url, K8S_TOKEN: "test-token" });
    const { plans } = await failInto(await createEndpoint(`http://127.0.0.1:${await closedPort()}/health`, { name: "Payments API" }));
    const done = await approvePlan(pending(plans, "rollout_restart").reference, "alice.sre");

    assert.equal(done.status, "SUCCEEDED");
    const [call] = k8s.calls;
    assert.equal(call.method, "PATCH");
    assert.equal(call.url, "/apis/apps/v1/namespaces/production-apps/deployments/payments-api");
    assert.equal(call.contentType, "application/strategic-merge-patch+json");
    assert.equal(call.auth, "Bearer test-token");
    assert.ok(call.body.spec.template.metadata.annotations["kubectl.kubernetes.io/restartedAt"]);
  });

  it("scales out through the scale subresource", async () => {
    Object.assign(process.env, { K8S_REMEDIATION_ENABLED: "true", K8S_API_URL: k8s.url, K8S_TOKEN: "test-token" });
    stub.routes["/sat"] = { status: 503 };
    const ep = await createEndpoint(`${stub.base}/sat`);
    await addHistory(ep.id, Array.from({ length: 10 }, (_, i) => ({ minsAgo: 120 + i * 40, ms: 100 + i })));
    await addHistory(ep.id, [{ minsAgo: 25, ms: 380 }, { minsAgo: 15, ms: 420 }, { minsAgo: 5, ms: 450 }]);
    const { plans } = await failInto(ep);

    const done = await approvePlan(pending(plans, "scale_deployment").reference, "alice.sre");
    assert.deepEqual([done.result!.from, done.result!.to], [3, 5]);
    const patch = k8s.calls.find((c) => c.method === "PATCH")!;
    assert.equal(patch.contentType, "application/merge-patch+json");
    assert.deepEqual(patch.body, { spec: { replicas: 5 } });
  });

  it("records an RBAC denial as FAILED", async () => {
    Object.assign(process.env, { K8S_REMEDIATION_ENABLED: "true", K8S_API_URL: k8s.url, K8S_TOKEN: "test-token" });
    k8s.state.forbidden = true;
    const { plans } = await failInto(await createEndpoint(`http://127.0.0.1:${await closedPort()}/health`));
    const failed = await approvePlan(pending(plans, "rollout_restart").reference, "alice.sre");
    assert.equal(failed.status, "FAILED");
    assert.match(String(failed.result!.error), /Kubernetes API 403: deployments.apps is forbidden/);
  });

  it("supersedes pending plans when the incident is re-analyzed", async () => {
    const { incident, plans } = await timeoutScenario();
    await analyzeAndPlan(incident.id);
    const all = await listPlans({ incidentId: incident.id });
    for (const old of plans) assert.equal(all.find((p) => p.id === old.id)?.status, "SUPERSEDED");
    assert.equal(all.filter((p) => p.status === "PENDING").length, plans.length);
  });

  it("refuses plans on an incident that's already resolved", async () => {
    const { incident, plans } = await timeoutScenario();
    await updateIncidentStatus(incident.id, "RESOLVED", "test.operator");
    await assert.rejects(approvePlan(pending(plans, "reprobe").reference, "alice.sre"), /already resolved/);
  });

  describe("autopilot", () => {
    it("only low-risk actions are eligible", async () => {
      await assert.rejects(setAutopilotPolicy("rollout_restart", true, "admin"), /only low-risk/);
      await assert.rejects(setAutopilotPolicy("update_endpoint_timeout", true, "admin"), /only low-risk/);
      const policies = await listAutopilotPolicies();
      assert.deepEqual(policies.filter((p) => p.eligible).map((p) => p.action).sort(), ["reduce_check_frequency", "reprobe", "run_traceroute"]);
    });

    it("runs enabled actions as soon as they're planned, leaving the rest pending", async () => {
      await setAutopilotPolicy("reprobe", true, "admin.ops");
      stub.routes["/auto"] = { status: 500 };
      const { plans } = await failInto(await createEndpoint(`${stub.base}/auto`));
      const auto = plans.find((p) => p.action === "reprobe")!;
      assert.equal(auto.status, "SUCCEEDED");
      assert.equal(auto.auto_executed, true);
      assert.equal(auto.decided_by, "AUTOPILOT");
      assert.ok(plans.filter((p) => p.action !== "reprobe").every((p) => p.status === "PENDING"));
    });
  });

  describe("chat tools", () => {
    it("lists pending steps and approves low-risk ones", async () => {
      const { incident } = await failInto(await createEndpoint(`http://127.0.0.1:${await closedPort()}/health`));
      const listed = (await executeTool("list_pending_remediations", { incident: incident.reference })).forModel as any[];
      assert.deepEqual(listed.map((p) => p.action).sort(), ["reprobe", "rollout_restart"]);

      const reprobe = listed.find((p) => p.action === "reprobe");
      const approved = (await executeTool("approve_remediation", { reference: reprobe.reference, decision: "approve" })).forModel as any;
      assert.equal(approved.status, "SUCCEEDED");
      assert.equal((await getPlan(reprobe.reference)).decided_by, "chat-assistant");
    });

    it("won't approve high-risk steps", async () => {
      const { incident } = await failInto(await createEndpoint(`http://127.0.0.1:${await closedPort()}/health`));
      const listed = (await executeTool("list_pending_remediations", { incident: incident.reference })).forModel as any[];
      const restart = listed.find((p) => p.action === "rollout_restart");
      const result = (await executeTool("approve_remediation", { reference: restart.reference, decision: "approve" })).forModel as any;
      assert.match(result.error, /approve it in the Incidents console/);
      assert.equal((await getPlan(restart.reference)).status, "PENDING");
    });
  });
});
