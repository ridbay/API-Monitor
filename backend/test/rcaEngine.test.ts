import "./helpers/setup";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { pool, prepareDatabase, resetDatabase } from "./helpers/db";
import { addDownResult, addHistory, check, closedPort, createEndpoint, incidentsFor, startStub } from "./helpers/fixtures";
import { analyzeIncident, getLatestRcaReport, RcaReport } from "../src/services/rcaEngine.service";
import { createIncident } from "../src/services/incident.service";
import { Endpoint } from "../src/types";

// Fails the endpoint three times so the detector opens an incident (which runs
// RCA), then returns the stored report.
async function diagnoseFailing(ep: Endpoint): Promise<RcaReport> {
  await check(ep, 3);
  const [incident] = await incidentsFor(ep.id);
  assert.ok(incident, "incident opened");
  const report = await getLatestRcaReport(incident.id);
  assert.ok(report, "RCA report stored");
  return report!;
}

const actions = (r: RcaReport) => r.recommendations.map((x) => x.action);

describe("root cause analysis", () => {
  let stub: Awaited<ReturnType<typeof startStub>>;

  before(async () => {
    await prepareDatabase();
    stub = await startStub();
  });
  beforeEach(async () => {
    await resetDatabase();
    for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  });
  after(async () => {
    await stub.close();
    await pool.end();
  });

  it("one route failing while its siblings are healthy → route_failure", async () => {
    stub.routes["/a"] = { status: 503 };
    await check(await createEndpoint(`${stub.base}/b`, { name: "sibling" }));
    const report = await diagnoseFailing(await createEndpoint(`${stub.base}/a`, { name: "Orders API" }));
    assert.equal(report.diagnosis.category, "route_failure");
    assert.equal(report.diagnosis.scope, "endpoint");
    assert.equal(report.diagnosis.confidence, "medium");
    assert.deepEqual(actions(report), ["manual", "rollout_restart", "reprobe"]);
  });

  it("every endpoint on the host failing → application_failure", async () => {
    stub.routes["/a"] = { status: 500 };
    stub.routes["/b"] = { status: 500 };
    await check(await createEndpoint(`${stub.base}/b`, { name: "sibling" }));
    const report = await diagnoseFailing(await createEndpoint(`${stub.base}/a`));
    assert.equal(report.diagnosis.category, "application_failure");
    assert.equal(report.diagnosis.scope, "service");
    assert.equal(report.diagnosis.confidence, "high");
  });

  it("port closed → service_unreachable with a restart", async () => {
    const report = await diagnoseFailing(await createEndpoint(`http://127.0.0.1:${await closedPort()}/health`, { name: "Payments API" }));
    assert.equal(report.diagnosis.category, "service_unreachable");
    const restart = report.recommendations.find((r) => r.action === "rollout_restart");
    assert.deepEqual(restart?.params, { namespace: "production-apps", deployment: "payments-api" }, "IP host → name from endpoint");
    assert.equal(restart?.requires, "kubernetes");
    assert.equal(restart?.risk, "high");
  });

  it("hostname doesn't resolve → dns_failure", async () => {
    const report = await diagnoseFailing(await createEndpoint("http://payments-api.does-not-exist.invalid/health"));
    assert.equal(report.diagnosis.category, "dns_failure");
    assert.equal(report.diagnosis.confidence, "high");
    assert.ok(!actions(report).includes("rollout_restart"), "third-party host: no Kubernetes action");
  });

  it("timeout close to normal p95 → timeout_too_tight with a concrete new timeout", async () => {
    stub.routes["/slow"] = { status: 200, delayMs: 400 };
    const ep = await createEndpoint(`${stub.base}/slow`, { timeout: 300 });
    await addHistory(ep.id, Array.from({ length: 10 }, (_, i) => ({ minsAgo: 120 + i * 40, ms: 250 + i * 3 })));
    const report = await diagnoseFailing(ep);
    assert.equal(report.diagnosis.category, "timeout_too_tight");
    assert.deepEqual(report.recommendations[0].params, { endpoint_id: ep.id, timeout: 1000 });
  });

  it("latency climbing before 5xx → resource_saturation with a scale-out", async () => {
    stub.routes["/a"] = { status: 503 };
    const ep = await createEndpoint(`${stub.base}/a`);
    await addHistory(ep.id, Array.from({ length: 10 }, (_, i) => ({ minsAgo: 120 + i * 40, ms: 100 + i })));
    await addHistory(ep.id, [{ minsAgo: 25, ms: 380 }, { minsAgo: 15, ms: 420 }, { minsAgo: 5, ms: 450 }]);
    const report = await diagnoseFailing(ep);
    assert.equal(report.diagnosis.category, "resource_saturation");
    assert.equal(report.recommendations[0].action, "scale_deployment");
    assert.ok(report.evidence.find((e) => e.signal === "Latency trend")?.abnormal);
  });

  it("config changed just before 5xx → config_regression", async () => {
    stub.routes["/a"] = { status: 502 };
    const created = await createEndpoint(`${stub.base}/a`);
    const { rows: [ep] } = await pool.query(
      `UPDATE endpoints SET created_at = NOW() - interval '2 days', updated_at = NOW() - interval '7 minutes' WHERE id = $1 RETURNING *`,
      [created.id]
    );
    const report = await diagnoseFailing(ep);
    assert.equal(report.diagnosis.category, "config_regression");
    assert.match(report.diagnosis.summary, /7 min before/);
  });

  for (const [status, category] of [[401, "auth_failure"], [404, "route_missing"], [429, "rate_limited"], [422, "contract_mismatch"]] as const) {
    it(`HTTP ${status} → ${category}`, async () => {
      stub.routes["/a"] = { status };
      const report = await diagnoseFailing(await createEndpoint(`${stub.base}/a`));
      assert.equal(report.diagnosis.category, category);
    });
  }

  it("429 suggests a slower interval, or asks the owner when already at 1h", async () => {
    stub.routes["/a"] = { status: 429 };
    const fast = await diagnoseFailing(await createEndpoint(`${stub.base}/a`, { interval: "5m" }));
    assert.deepEqual(fast.recommendations[0].params, { endpoint_id: fast.recommendations[0].params.endpoint_id, interval: "15m" });

    stub.routes["/b"] = { status: 429 };
    const slowest = await diagnoseFailing(await createEndpoint(`${stub.base}/b`, { interval: "1h" }));
    assert.equal(slowest.recommendations[0].action, "manual");
  });

  it("most other hosts failing too → shared_dependency at fleet scope", async () => {
    for (const host of ["svc-a.test", "svc-b.test", "svc-c.test"]) {
      const other = await createEndpoint(`http://${host}/health`, { name: host });
      await addDownResult(other.id);
    }
    stub.routes["/a"] = { status: 503 };
    const report = await diagnoseFailing(await createEndpoint(`${stub.base}/a`));
    assert.equal(report.diagnosis.category, "shared_dependency");
    assert.equal(report.diagnosis.scope, "fleet");
  });

  it("intermittent failures lower confidence and say so", async () => {
    stub.routes["/a"] = { status: 503 };
    const ep = await createEndpoint(`${stub.base}/a`);
    // up/down alternation before the final streak
    for (let i = 0; i < 4; i++) {
      stub.routes["/a"] = { status: i % 2 ? 503 : 200 };
      await check(ep);
    }
    stub.routes["/a"] = { status: 401 };
    const report = await diagnoseFailing(ep);
    assert.equal(report.diagnosis.category, "auth_failure");
    assert.equal(report.diagnosis.confidence, "medium", "high downgraded");
    assert.match(report.diagnosis.summary, /intermittent/);
  });

  it("updates the incident's root cause and logs the analysis", async () => {
    stub.routes["/a"] = { status: 404 };
    const ep = await createEndpoint(`${stub.base}/a`);
    await check(ep, 3);
    const [incident] = await incidentsFor(ep.id);
    assert.equal(incident.root_cause_category, "route_missing");
    assert.match(incident.root_cause, /no longer exists/);
  });

  it("an incident with no endpoint gets a low-confidence report asking to link one", async () => {
    const incident = await createIncident({ service_name: "Legacy batch", title: "Manual", severity: "P3" });
    const report = await analyzeIncident(incident.id);
    assert.equal(report.diagnosis.confidence, "low");
    assert.equal(report.evidence.length, 0);
    assert.match(report.recommendations[0].title, /Link Legacy batch/);
  });
});
