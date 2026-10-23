import "./helpers/setup";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import net from "net";
import { pool, prepareDatabase, resetDatabase } from "./helpers/db";
import { createEndpoint } from "./helpers/fixtures";
import {
  cancelRun,
  createSuite,
  getRun,
  listSuites,
  recoverInterruptedRuns,
  RunStatus,
  startRun,
  subscribeToRun,
} from "../src/services/loadSuite.service";
import type { LoadSummary, WorkerTick } from "../src/services/loadSuite.types";

type RunEnd = { status: RunStatus; summary: LoadSummary | null; error: string | null };

function waitForEnd(runId: number, onTick?: (t: WorkerTick) => void): Promise<RunEnd> {
  return new Promise((resolve) => {
    const sub = subscribeToRun(runId, (t) => onTick?.(t), resolve);
    if (!sub) getRun(runId).then((r) => resolve({ status: r.status, summary: r.summary, error: r.error }));
  });
}

describe("load test suites", () => {
  let server: http.Server;
  let base: string;
  let flaky = 0;
  let ids: { fast: number; slow: number; flaky: number };

  before(async () => {
    await prepareDatabase();
    server = http.createServer((req, res) => {
      setTimeout(() => {
        res.statusCode = req.url === "/flaky" && ++flaky % 5 === 0 ? 500 : 200;
        res.end("ok");
      }, req.url === "/slow" ? 50 : 2);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  });
  beforeEach(async () => {
    await resetDatabase();
    ids = {
      fast: (await createEndpoint(`${base}/fast`, { active: false })).id,
      slow: (await createEndpoint(`${base}/slow`, { active: false })).id,
      flaky: (await createEndpoint(`${base}/flaky`, { active: false })).id,
    };
  });
  after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
  });

  const profile = { virtual_users: 10, ramp_up_s: 2, duration_s: 5, max_rps: null };

  describe("validation", () => {
    const issues = async (body: unknown) => {
      try {
        await createSuite(body);
        return "";
      } catch (e: any) {
        return e.issues ? e.issues.map((i: any) => i.message).join("; ") : e.message;
      }
    };
    it("rejects ramp-up ≥ duration", async () => {
      assert.match(await issues({ name: "x", endpoints: [{ endpoint_id: ids.fast }], profile: { ...profile, ramp_up_s: 5 } }), /Ramp-up/);
    });
    it("rejects the same endpoint twice", async () => {
      assert.match(await issues({ name: "x", endpoints: [{ endpoint_id: ids.fast }, { endpoint_id: ids.fast }], profile }), /once per suite/);
    });
    it("rejects unknown endpoints", async () => {
      assert.match(await issues({ name: "x", endpoints: [{ endpoint_id: 999999 }], profile }), /Unknown endpoint/);
    });
    it("caps virtual users at 200", async () => {
      assert.match(await issues({ name: "x", endpoints: [{ endpoint_id: ids.fast }], profile: { ...profile, virtual_users: 5000 } }), /200/);
    });
  });

  it("runs a weighted multi-endpoint suite in a worker, streaming ticks", async () => {
    const suite = await createSuite({
      name: "Mixed",
      endpoints: [{ endpoint_id: ids.fast, weight: 3 }, { endpoint_id: ids.slow, weight: 1 }, { endpoint_id: ids.flaky, weight: 1 }],
      profile,
    });

    let maxLag = 0;
    let last = performance.now();
    const lagTimer = setInterval(() => {
      const now = performance.now();
      maxLag = Math.max(maxLag, now - last - 20);
      last = now;
    }, 20);

    const run = await startRun(suite.id);
    await assert.rejects(startRun(suite.id), /still in progress/);
    const ticks: WorkerTick[] = [];
    const end = await waitForEnd(run.id, (t) => ticks.push(t));
    clearInterval(lagTimer);

    assert.equal(end.status, "COMPLETED");
    const summary = end.summary!;
    assert.ok(summary.requests > 100, `${summary.requests} requests`);

    assert.ok(ticks.length >= 4, `${ticks.length} ticks`);
    assert.ok(ticks[0].active_vus < 10, "ramping up at first tick");
    assert.ok(ticks.some((t) => t.active_vus === 10), "reaches 10 VUs");

    const byId = Object.fromEntries(summary.endpoints.map((e) => [e.endpoint_id, e]));
    const ratio = byId[ids.fast].requests / byId[ids.slow].requests;
    assert.ok(ratio > 2.2 && ratio < 4, `weights ~3:1 (got ${ratio.toFixed(2)})`);
    assert.ok(byId[ids.slow].latency.p50 >= 50, "slow endpoint latency measured");
    assert.ok(byId[ids.fast].latency.p50 < 30, "fast endpoint latency measured");
    assert.ok(Math.abs(byId[ids.flaky].error_rate_pct - 20) < 6, `flaky ~20% errors (${byId[ids.flaky].error_rate_pct}%)`);
    assert.equal(byId[ids.fast].errors, 0);
    assert.ok(maxLag < 100, `main event loop stayed responsive (max lag ${maxLag.toFixed(0)}ms)`);

    const saved = await getRun(run.id);
    assert.equal(saved.status, "COMPLETED");
    assert.equal(saved.timeline.length, ticks.length);
    assert.equal(saved.summary!.requests, summary.requests);
    assert.equal((await listSuites()).find((s) => s.id === suite.id)?.last_run?.status, "COMPLETED");
  });

  it("holds the combined rate under max_rps", async () => {
    const suite = await createSuite({ name: "Capped", endpoints: [{ endpoint_id: ids.fast }], profile: { virtual_users: 20, ramp_up_s: 0, duration_s: 5, max_rps: 40 } });
    const end = await waitForEnd((await startRun(suite.id)).id);
    assert.ok(end.summary!.throughput_rps <= 42 && end.summary!.throughput_rps >= 30, `${end.summary!.throughput_rps} rps`);
  });

  it("can be cancelled, keeping what it measured", async () => {
    const suite = await createSuite({ name: "Long", endpoints: [{ endpoint_id: ids.fast }], profile: { virtual_users: 5, ramp_up_s: 0, duration_s: 60, max_rps: 100 } });
    const run = await startRun(suite.id);
    setTimeout(() => cancelRun(run.id), 1500);
    const end = await waitForEnd(run.id);
    assert.equal(end.status, "CANCELLED");
    assert.ok(end.summary!.duration_ms < 5000);
    assert.ok(end.summary!.requests > 0);
    await assert.rejects(cancelRun(run.id), /not in progress/);
  });

  it("marks runs interrupted by a restart as FAILED", async () => {
    const { rows: [stale] } = await pool.query(
      `INSERT INTO load_test_runs (suite_name, status, profile, endpoints) VALUES ('stale', 'RUNNING', '{}', '[]') RETURNING id`
    );
    await recoverInterruptedRuns();
    const run = await getRun(stale.id);
    assert.equal(run.status, "FAILED");
    assert.match(run.error!, /restart/);
  });
});
