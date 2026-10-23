import path from "path";
import { EventEmitter } from "events";
import { Worker } from "worker_threads";
import { z } from "zod";
import { pool } from "../config/db";
import { HttpError } from "../middleware/errorHandler";
import { Endpoint } from "../types";
import type { LoadJob, LoadJobEndpoint, LoadProfile, LoadSummary, WorkerMessage, WorkerTick } from "./loadSuite.types";

export const suiteSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    endpoints: z
      .array(z.object({ endpoint_id: z.number().int(), weight: z.number().int().min(1).max(100).default(1) }))
      .min(1)
      .max(20),
    profile: z.object({
      virtual_users: z.number().int().min(1).max(200),
      ramp_up_s: z.number().int().min(0).max(300).default(0),
      duration_s: z.number().int().min(5).max(600),
      max_rps: z.number().int().min(1).max(2000).nullable().default(null),
    }),
  })
  .refine((s) => s.profile.ramp_up_s < s.profile.duration_s, {
    message: "Ramp-up must be shorter than the test duration",
    path: ["profile", "ramp_up_s"],
  })
  .refine((s) => new Set(s.endpoints.map((e) => e.endpoint_id)).size === s.endpoints.length, {
    message: "Each endpoint can appear once per suite",
    path: ["endpoints"],
  });

export type SuiteInput = z.infer<typeof suiteSchema>;

export interface LoadSuite {
  id: number;
  name: string;
  endpoints: Array<{ endpoint_id: number; weight: number }>;
  profile: LoadProfile;
  created_at: string;
  updated_at: string;
  last_run?: { id: number; status: RunStatus; started_at: string; summary: LoadSummary | null } | null;
}

export type RunStatus = "RUNNING" | "COMPLETED" | "CANCELLED" | "FAILED";

export interface LoadRun {
  id: number;
  suite_id: number | null;
  suite_name: string;
  status: RunStatus;
  profile: LoadProfile;
  endpoints: LoadJobEndpoint[];
  timeline: WorkerTick[];
  summary: LoadSummary | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

// Live state for the run in progress. One run at a time: concurrent tests
// would compete for the same sockets and CPU and skew each other's numbers.
interface ActiveRun {
  id: number;
  worker: Worker;
  timeline: WorkerTick[];
  events: EventEmitter;
}
let active: ActiveRun | null = null;

// ---------- Suites ----------

export async function listSuites(): Promise<LoadSuite[]> {
  const { rows } = await pool.query<LoadSuite>(
    `SELECT s.*,
       (SELECT json_build_object('id', r.id, 'status', r.status, 'started_at', r.started_at, 'summary', r.summary)
        FROM load_test_runs r WHERE r.suite_id = s.id ORDER BY r.started_at DESC LIMIT 1) AS last_run
     FROM load_test_suites s ORDER BY s.updated_at DESC`
  );
  return rows;
}

export async function createSuite(input: unknown): Promise<LoadSuite> {
  const suite = suiteSchema.parse(input);
  await assertEndpointsExist(suite.endpoints.map((e) => e.endpoint_id));
  const { rows } = await pool.query<LoadSuite>(
    `INSERT INTO load_test_suites (name, endpoints, profile) VALUES ($1, $2, $3) RETURNING *`,
    [suite.name, JSON.stringify(suite.endpoints), JSON.stringify(suite.profile)]
  );
  return rows[0];
}

export async function updateSuite(id: number, input: unknown): Promise<LoadSuite> {
  const suite = suiteSchema.parse(input);
  await assertEndpointsExist(suite.endpoints.map((e) => e.endpoint_id));
  const { rows } = await pool.query<LoadSuite>(
    `UPDATE load_test_suites SET name = $2, endpoints = $3, profile = $4, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, suite.name, JSON.stringify(suite.endpoints), JSON.stringify(suite.profile)]
  );
  if (!rows.length) throw new HttpError(404, `Suite ${id} not found`);
  return rows[0];
}

export async function deleteSuite(id: number): Promise<void> {
  const { rowCount } = await pool.query(`DELETE FROM load_test_suites WHERE id = $1`, [id]);
  if (!rowCount) throw new HttpError(404, `Suite ${id} not found`);
}

async function assertEndpointsExist(ids: number[]) {
  const { rows } = await pool.query<{ id: number }>(`SELECT id FROM endpoints WHERE id = ANY($1) AND deleted_at IS NULL`, [ids]);
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new HttpError(400, `Unknown endpoint id(s): ${missing.join(", ")}`);
}

// ---------- Runs ----------

export async function startRun(suiteId: number): Promise<LoadRun> {
  if (active) throw new HttpError(409, `Load test run ${active.id} is still in progress`);

  const { rows: [suite] } = await pool.query<LoadSuite>(`SELECT * FROM load_test_suites WHERE id = $1`, [suiteId]);
  if (!suite) throw new HttpError(404, `Suite ${suiteId} not found`);

  const { rows: endpointRows } = await pool.query<Endpoint>(
    `SELECT * FROM endpoints WHERE id = ANY($1) AND deleted_at IS NULL`,
    [suite.endpoints.map((e) => e.endpoint_id)]
  );
  const byId = new Map(endpointRows.map((e) => [e.id, e]));
  const endpoints: LoadJobEndpoint[] = suite.endpoints
    .filter((e) => byId.has(e.endpoint_id))
    .map((e) => {
      const ep = byId.get(e.endpoint_id)!;
      return { id: ep.id, name: ep.name, url: ep.url, method: ep.method, expected_status: ep.expected_status, timeout: ep.timeout, weight: e.weight };
    });
  if (!endpoints.length) throw new HttpError(409, "None of this suite's endpoints exist any more");

  const { rows: [run] } = await pool.query<LoadRun>(
    `INSERT INTO load_test_runs (suite_id, suite_name, status, profile, endpoints) VALUES ($1, $2, 'RUNNING', $3, $4) RETURNING *`,
    [suite.id, suite.name, JSON.stringify(suite.profile), JSON.stringify(endpoints)]
  );

  const job: LoadJob = { profile: suite.profile, endpoints };
  const worker = spawnWorker(job);
  const state: ActiveRun = { id: run.id, worker, timeline: [], events: new EventEmitter() };
  state.events.setMaxListeners(50);
  active = state;

  let finished = false;
  const finish = async (status: RunStatus, summary: LoadSummary | null, error: string | null) => {
    if (finished) return;
    finished = true;
    try {
      await pool.query(
        `UPDATE load_test_runs SET status = $2, summary = $3, timeline = $4, error = $5, finished_at = NOW() WHERE id = $1`,
        [run.id, status, summary ? JSON.stringify(summary) : null, JSON.stringify(state.timeline), error]
      );
    } finally {
      active = null;
      state.events.emit("end", { status, summary, error });
      worker.terminate().catch(() => {});
    }
  };

  worker.on("message", (msg: WorkerMessage) => {
    if (msg.type === "tick") {
      state.timeline.push(msg.tick);
      state.events.emit("tick", msg.tick);
    } else if (msg.type === "done") {
      finish(msg.summary.cancelled ? "CANCELLED" : "COMPLETED", msg.summary, null).catch((e) => console.error("Saving load run failed:", e));
    } else {
      finish("FAILED", null, msg.error).catch((e) => console.error("Saving load run failed:", e));
    }
  });
  worker.on("error", (err) => finish("FAILED", null, err.message).catch((e) => console.error("Saving load run failed:", e)));
  worker.on("exit", (code) => {
    if (!finished) finish("FAILED", null, `Load worker exited with code ${code}`).catch((e) => console.error("Saving load run failed:", e));
  });

  return run;
}

export async function cancelRun(runId: number): Promise<void> {
  if (!active || active.id !== runId) throw new HttpError(409, `Run ${runId} is not in progress`);
  active.worker.postMessage("stop");
}

export async function getRun(runId: number): Promise<LoadRun> {
  const { rows } = await pool.query<LoadRun>(`SELECT * FROM load_test_runs WHERE id = $1`, [runId]);
  if (!rows.length) throw new HttpError(404, `Run ${runId} not found`);
  const run = rows[0];
  if (active?.id === runId) run.timeline = active.timeline;
  return run;
}

export async function listRuns(suiteId?: number): Promise<Omit<LoadRun, "timeline">[]> {
  const { rows } = await pool.query(
    `SELECT id, suite_id, suite_name, status, profile, endpoints, summary, error, started_at, finished_at
     FROM load_test_runs ${suiteId ? "WHERE suite_id = $1" : ""} ORDER BY started_at DESC LIMIT 50`,
    suiteId ? [suiteId] : []
  );
  return rows;
}

// Subscribe to a run in progress; returns null if it has already finished.
export function subscribeToRun(
  runId: number,
  onTick: (tick: WorkerTick) => void,
  onEnd: (end: { status: RunStatus; summary: LoadSummary | null; error: string | null }) => void
): { backlog: WorkerTick[]; unsubscribe: () => void } | null {
  if (!active || active.id !== runId) return null;
  const { events } = active;
  events.on("tick", onTick);
  events.once("end", onEnd);
  return {
    backlog: [...active.timeline],
    unsubscribe: () => {
      events.off("tick", onTick);
      events.off("end", onEnd);
    },
  };
}

// A restart kills the worker mid-run; mark those runs instead of leaving them RUNNING forever.
export async function recoverInterruptedRuns(): Promise<void> {
  await pool.query(
    `UPDATE load_test_runs SET status = 'FAILED', error = 'Interrupted by a server restart', finished_at = NOW() WHERE status = 'RUNNING'`
  );
}

// Compiled builds run dist/workers/loadWorker.js; under tsx the worker is a
// .ts file and needs the tsx loader passed through.
function spawnWorker(job: LoadJob): Worker {
  const isTs = __filename.endsWith(".ts");
  const file = path.join(__dirname, "..", "workers", `loadWorker.${isTs ? "ts" : "js"}`);
  return new Worker(file, { workerData: job, execArgv: isTs ? ["--import", "tsx"] : [] });
}
