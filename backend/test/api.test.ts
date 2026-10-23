import "./helpers/setup";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import net from "net";
import { pool, prepareDatabase, resetDatabase } from "./helpers/db";
import { check, createEndpoint, incidentsFor, startStub } from "./helpers/fixtures";
import { app } from "../src/app";

describe("HTTP API", () => {
  let server: http.Server;
  let api: string;
  let stub: Awaited<ReturnType<typeof startStub>>;

  before(async () => {
    await prepareDatabase();
    stub = await startStub();
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    api = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/api`;
  });
  beforeEach(resetDatabase);
  after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await stub.close();
    await pool.end();
  });

  // Response bodies are asserted field by field, so they're untyped here.
  const json = (res: Response): Promise<any> => res.json();
  const post = (path: string, body: unknown) =>
    fetch(`${api}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("GET /incidents/:id includes the RCA report and remediation plans", async () => {
    stub.routes["/a"] = { status: 503 };
    const ep = await createEndpoint(`${stub.base}/a`);
    await check(ep, 3);
    const [incident] = await incidentsFor(ep.id);

    const res = await fetch(`${api}/incidents/${incident.reference}`);
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.equal(body.rca.diagnosis.category, "route_failure");
    assert.ok(body.remediation_plans.length > 0);
    assert.ok(Array.isArray(body.notifications));
  });

  it("maps remediation errors to 404 / 409", async () => {
    const missing = await post("/remediation/plans/REC-9999/approve", { actor: "alice.sre" });
    assert.equal(missing.status, 404);

    stub.routes["/a"] = { status: 503 };
    const ep = await createEndpoint(`${stub.base}/a`);
    await check(ep, 3);
    const [incident] = await incidentsFor(ep.id);
    const plans = await json(await fetch(`${api}/remediation/plans?incident_id=${incident.id}`));

    const noName = await post(`/remediation/plans/${plans[0].reference}/approve`, { actor: "" });
    assert.equal(noName.status, 409);
    assert.match((await json(noName)).error, /approver name/);
  });

  it("refuses to enable autopilot for high-risk actions", async () => {
    const res = await fetch(`${api}/remediation/autopilot/rollout_restart`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, actor: "admin" }),
    });
    assert.equal(res.status, 409);
  });

  it("ingests a raw text/plain log body with defaults from the query string", async () => {
    const body = ["GET /orders/1 200 3.0 ms - 2", "GET /orders/2 200 4.0 ms - 2", "", "not a request"].join("\n");
    const res = await fetch(`${api}/discovery/ingest?host=orders.svc&service=orders`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    assert.equal(res.status, 201);
    const result = await json(res);
    assert.equal(result.lines_received, 3, "blank lines dropped");
    assert.equal(result.lines_parsed, 2);
    assert.equal(result.lines_unparsed, 1);

    const routes = await json(await fetch(`${api}/discovery/routes?status=NEW`));
    assert.deepEqual(routes.map((r: any) => `${r.host} ${r.method} ${r.path_template} ${r.service_name}`), ["orders.svc GET /orders/:id orders"]);
  });

  it("rejects an ingest request with no lines", async () => {
    const res = await post("/discovery/ingest", { nope: true });
    assert.equal(res.status, 400);
  });

  it("returns 400 with details for an invalid load suite", async () => {
    const res = await post("/load-suites/suites", { name: "", endpoints: [], profile: { virtual_users: 0, duration_s: 1 } });
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error, "Validation failed");
  });

  it("streams a load run over SSE, ending with the summary", async () => {
    const ep = await createEndpoint(`${stub.base}/fast`, { active: false });
    const suite = await json(await post("/load-suites/suites", {
      name: "SSE",
      endpoints: [{ endpoint_id: ep.id }],
      profile: { virtual_users: 2, ramp_up_s: 0, duration_s: 5, max_rps: 20 },
    }));
    const run = await json(await post(`/load-suites/suites/${suite.id}/run`, {}));

    const res = await fetch(`${api}/load-suites/runs/${run.id}/stream`);
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    assert.equal(res.headers.get("x-accel-buffering"), "no");
    const text = await res.text(); // the server closes the stream after "end"
    const events = [...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
    assert.ok(events.filter((e) => e === "tick").length >= 3, `ticks: ${events.join(",")}`);
    assert.equal(events[events.length - 1], "end");
    const end = JSON.parse(text.trim().split("\n").pop()!.replace(/^data: /, ""));
    assert.equal(end.status, "COMPLETED");

    // A finished run replays its timeline and ends immediately.
    const replay = await (await fetch(`${api}/load-suites/runs/${run.id}/stream`)).text();
    assert.equal([...replay.matchAll(/^event: tick$/gm)].length, events.filter((e) => e === "tick").length);
  });
});
