import "./helpers/setup";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import net from "net";
import crypto from "crypto";
import { pool, prepareDatabase, resetDatabase } from "./helpers/db";
import { createEndpoint } from "./helpers/fixtures";
import { discoverySummary, ingestLogs, listRoutes, promoteRoute, setRouteIgnored } from "../src/services/logDiscovery.service";
import { getServiceTopology } from "../src/services/topology.service";

describe("endpoint discovery from logs", () => {
  let server: http.Server;
  let host: string;

  // The "discovered service": /api/orders/* fails, everything else is fine,
  // so baseline probes have something real to hit.
  before(async () => {
    await prepareDatabase();
    server = http.createServer((req, res) => {
      res.statusCode = req.url!.startsWith("/api/orders") ? 500 : 200;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    host = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  });
  beforeEach(resetDatabase);
  after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
  });

  const clf = (method: string, path: string, status: number, secs: number, extra = "") =>
    `${host} 10.0.0.1 - - [22/Oct/2026:10:00:00 +0000] "${method} ${path} HTTP/1.1" ${status} 512 "-" "svc-client" rt=${secs.toFixed(3)}${extra}`;
  const route = async (method: string, template: string) =>
    (await listRoutes({ host })).find((r) => r.method === method && r.path_template === template)!;

  async function ingestMixedBatch() {
    const lines: string[] = [];
    for (let i = 0; i < 600; i++) lines.push(clf("GET", `/api/users/${1000 + i}?expand=true`, 200, 0.02 + (i % 50) / 1000, ` pod=users-${i % 3}`));
    for (let i = 0; i < 200; i++) lines.push(clf("GET", `/api/orders/${crypto.randomUUID()}`, i % 4 === 0 ? 503 : 200, i % 10 === 0 ? 1.8 : 0.09));
    for (let i = 0; i < 50; i++) lines.push(clf("POST", "/api/orders", 201, 0.12));
    for (let i = 0; i < 30; i++) lines.push(clf("GET", "/health", 200, 0.001));
    for (let i = 0; i < 40; i++) lines.push(clf("GET", `/static/app.${i}.js`, 200, 0.001));
    lines.push("GET /no/host/known 200 3.1 ms - 12", "kernel: eth0 link up", '{"msg":"hello"}');
    return ingestLogs(lines, {}, "test", { waitForBaseline: true });
  }

  it("parses, normalizes and aggregates a mixed batch", async () => {
    const result = await ingestMixedBatch();
    assert.equal(result.lines_parsed, 880);
    assert.equal(result.lines_skipped_static, 40);
    assert.equal(result.lines_without_host, 1);
    assert.equal(result.lines_unparsed, 2);
    assert.equal(result.routes_new, 4);

    const users = await route("GET", "/api/users/:id");
    assert.equal(users.request_count, 600);
    assert.equal(users.error_rate_pct, 0);
    assert.equal(users.sample_path, "/api/users/1000", "query string dropped");
    assert.equal(users.pods.length, 3);
    assert.equal(users.p95_latency_ms, 100);
    assert.ok(users.avg_latency_ms! >= 20 && users.avg_latency_ms! <= 70);
    assert.equal(users.scheme, "http", "IP host treated as internal");

    const orders = await route("GET", "/api/orders/:uuid");
    assert.equal(orders.error_rate_pct, 25);
    assert.equal(orders.p95_latency_ms, 2500);
  });

  it("recognizes routes that are already monitored", async () => {
    const existing = await createEndpoint(`http://${host}/health`, { active: false });
    await ingestMixedBatch();
    const health = await route("GET", "/health");
    assert.equal(health.status, "MONITORED");
    assert.equal(health.endpoint_id, existing.id);
  });

  it("probes new GET routes once, and never non-GET routes", async () => {
    await ingestMixedBatch();
    const users = await route("GET", "/api/users/:id");
    const orders = await route("GET", "/api/orders/:uuid");
    assert.equal(users.baseline_status, "up");
    assert.equal(users.baseline_status_code, 200);
    assert.equal(orders.baseline_status, "down");
    assert.equal(orders.baseline_status_code, 500);
    assert.equal((await route("POST", "/api/orders")).baseline_checked_at, null);
  });

  it("merges later batches into existing routes", async () => {
    await ingestMixedBatch();
    const more = Array.from({ length: 100 }, (_, i) => clf("GET", `/api/users/${i}`, i < 10 ? 404 : 200, 0.03, " pod=users-9"));
    const result = await ingestLogs(more, {}, "test");
    const users = await route("GET", "/api/users/:id");
    assert.equal(result.routes_new, 0);
    assert.equal(users.request_count, 700);
    assert.deepEqual(users.status_counts, { "200": 690, "404": 10 });
    assert.equal(users.pods.length, 4);
  });

  it("promotes a GET route to a tagged, checked endpoint", async () => {
    await ingestMixedBatch();
    const users = await route("GET", "/api/users/:id");
    const { endpoint } = await promoteRoute(users.id, {});
    assert.equal(endpoint.source, "SOURCE_LOG_DISCOVERED");
    assert.equal(endpoint.url, `http://${host}/api/users/1000`);
    assert.equal(endpoint.expected_status, 200);
    assert.equal((await route("GET", "/api/users/:id")).status, "PROMOTED");
    await assert.rejects(promoteRoute(users.id, {}), /already monitored/);
  });

  it("refuses to promote non-GET routes or invalid URLs", async () => {
    await ingestMixedBatch();
    await assert.rejects(promoteRoute((await route("POST", "/api/orders")).id, {}), /Only GET/);
    await assert.rejects(promoteRoute((await route("GET", "/api/orders/:uuid")).id, { url: "not a url" }), /url/i);
  });

  it("ignores and restores routes", async () => {
    await ingestMixedBatch();
    const orders = await route("GET", "/api/orders/:uuid");
    await setRouteIgnored(orders.id, true);
    assert.equal((await route("GET", "/api/orders/:uuid")).status, "IGNORED");
    await assert.rejects(setRouteIgnored(orders.id, true), /ignored, not new/);
    await setRouteIgnored(orders.id, false);
    assert.equal((await route("GET", "/api/orders/:uuid")).status, "NEW");
  });

  it("caps a host at 500 routes", async () => {
    const words = new Set<string>();
    while (words.size < 600) words.add(Array.from({ length: 7 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join(""));
    const result = await ingestLogs([...words].map((w) => clf("POST", `/pages/${w}`, 200, 0.01)), {}, "test");
    assert.equal(result.routes_new, 500);
    assert.equal(result.routes_rejected, 100);
  });

  it("applies default host/service to logs that lack them, and feeds topology", async () => {
    const lines = Array.from({ length: 20 }, (_, i) =>
      JSON.stringify({ log: `POST /reserve/${i} ${i < 5 ? 500 : 200} 8.0 ms - 2`, kubernetes: { pod_name: `inventory-${i % 2}`, labels: { app: "inventory" } } })
    );
    await ingestLogs(lines, { host: "inventory.svc" }, "test");
    const [inv] = await listRoutes({ host: "inventory.svc" });
    assert.equal(inv.path_template, "/reserve/:id");
    assert.equal(inv.service_name, "inventory");

    const node = (await getServiceTopology()).nodes.find((n) => n.id === "svc-inventory-svc");
    assert.equal(node?.status, "down", "25% 5xx");
    assert.equal(node?.podCount, 2);

    const summary = await discoverySummary();
    assert.equal(summary.counts.NEW, 1);
    assert.equal(summary.hosts, 1);
  });

  it("rejects oversized batches", async () => {
    await assert.rejects(ingestLogs(new Array(200_001).fill("x"), {}, "test"), /At most 200000 lines/);
  });
});
