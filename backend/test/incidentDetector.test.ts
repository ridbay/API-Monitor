import "./helpers/setup";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { pool, prepareDatabase, resetDatabase } from "./helpers/db";
import { check, createEndpoint, incidentsFor, startStub, timeline } from "./helpers/fixtures";
import { createIncident, updateIncidentStatus } from "../src/services/incident.service";
import { executeCheck } from "../src/services/monitoring.service";

describe("incident detection", () => {
  let stub: Awaited<ReturnType<typeof startStub>>;

  before(async () => {
    await prepareDatabase();
    stub = await startStub();
  });
  beforeEach(async () => {
    await resetDatabase();
    stub.routes["/health"] = { status: 503 };
  });
  after(async () => {
    await stub.close();
    await pool.end();
  });

  it("opens an incident on the 3rd consecutive failure, not before", async () => {
    const ep = await createEndpoint(`${stub.base}/health`);
    await check(ep, 2);
    assert.equal((await incidentsFor(ep.id)).length, 0);

    await check(ep);
    const [incident] = await incidentsFor(ep.id);
    assert.equal(incident.status, "TRIGGERED");
    assert.equal(incident.severity, "P2");
    assert.equal(incident.title, "3 consecutive failed checks — HTTP 503");
    assert.match(incident.reference, /^INC-\d{6}-\d{4}$/);
    assert.ok(incident.servicenow_ticket_num, "ServiceNow ticket attached");
    assert.equal(incident.affected_pods, null, "no invented pod names");

    const events = (await timeline(incident.id)).map((e) => e.event_type);
    assert.deepEqual(events.slice(0, 2), ["TRIGGERED", "SERVICENOW_SYNC"]);
    assert.ok(events.includes("RCA_COMPLETED"), "root cause analysis ran");
    assert.ok(events.includes("REMEDIATION_PLANNED"), "remediation was planned");
  });

  it("classifies client errors as P3", async () => {
    stub.routes["/health"] = { status: 404 };
    const ep = await createEndpoint(`${stub.base}/health`);
    await check(ep, 3);
    assert.equal((await incidentsFor(ep.id))[0].severity, "P3");
  });

  it("doesn't open a duplicate while one is open", async () => {
    const ep = await createEndpoint(`${stub.base}/health`);
    await check(ep, 6);
    assert.equal((await incidentsFor(ep.id)).length, 1);
  });

  it("auto-resolves after 2 consecutive passes, not 1", async () => {
    const ep = await createEndpoint(`${stub.base}/health`);
    await check(ep, 3);
    stub.routes["/health"] = { status: 200 };

    await check(ep);
    assert.equal((await incidentsFor(ep.id))[0].status, "TRIGGERED");
    await check(ep);
    const [incident] = await incidentsFor(ep.id);
    assert.equal(incident.status, "RESOLVED");
    assert.ok((await timeline(incident.id)).some((e) => e.actor === "AUTO_RECOVERY"));
  });

  it("needs fresh failures after a manual resolve before re-opening", async () => {
    const ep = await createEndpoint(`${stub.base}/health`);
    await check(ep, 3);
    const [first] = await incidentsFor(ep.id);
    await updateIncidentStatus(first.id, "RESOLVED", "test.operator");

    await check(ep, 2);
    assert.equal((await incidentsFor(ep.id)).length, 1, "2 fresh failures aren't enough");
    await check(ep);
    const incidents = await incidentsFor(ep.id);
    assert.equal(incidents.length, 2);
    assert.equal(incidents[1].status, "TRIGGERED");
  });

  it("opens exactly one incident when the same endpoint is checked in parallel", async () => {
    const ep = await createEndpoint(`${stub.base}/health`);
    await check(ep, 2);
    await Promise.all([executeCheck(ep), executeCheck(ep), executeCheck(ep)]);
    assert.equal((await incidentsFor(ep.id)).length, 1);
  });

  it("retries the reference when the random suffix collides", async () => {
    const yyyymm = new Date().toISOString().slice(0, 7).replace("-", "");
    await pool.query(
      `INSERT INTO incidents (reference, service_name, title, severity) VALUES ($1, 'existing', 'existing', 'P4')`,
      [`INC-${yyyymm}-1000`]
    );
    // First draw → suffix 1000 (taken), then 5500.
    const draws = [0, 0.5];
    const random = mock.method(Math, "random", () => draws.shift() ?? 0.5);
    try {
      const incident = await createIncident({ service_name: "svc", title: "t", severity: "P3" });
      assert.equal(incident.reference, `INC-${yyyymm}-5500`);
    } finally {
      random.mock.restore();
    }
  });
});
