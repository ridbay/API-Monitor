import http from "http";
import net from "net";
import { pool } from "../../src/config/db";
import { Endpoint } from "../../src/types";
import { executeCheck } from "../../src/services/monitoring.service";

export interface Stub {
  base: string;
  close: () => Promise<void>;
}

export type Route = { status: number; delayMs?: number };

// Local HTTP server standing in for a monitored service. `routes` is read on
// every request, so tests can flip a path from 503 to 200 mid-test.
export async function startStub(routes: Record<string, Route> = {}): Promise<Stub & { routes: Record<string, Route> }> {
  const server = http.createServer((req, res) => {
    const route = routes[req.url ?? ""] ?? { status: 200 };
    setTimeout(() => {
      res.statusCode = route.status;
      res.end();
    }, route.delayMs ?? 0);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    routes,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// A port nothing listens on, for connection-refused scenarios.
export async function closedPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

// Endpoints are created active (so they count as siblings/fleet) with a fresh
// last_checked; no scheduler runs in tests, but this mirrors how the app would
// see a recently checked endpoint.
export async function createEndpoint(
  url: string,
  options: { name?: string; timeout?: number; interval?: string; active?: boolean } = {}
): Promise<Endpoint> {
  const { rows } = await pool.query<Endpoint>(
    `INSERT INTO endpoints (name, url, method, expected_status, timeout, interval, is_active)
     VALUES ($1, $2, 'GET', 200, $3, $4, $5) RETURNING *`,
    [options.name ?? "Test endpoint", url, options.timeout ?? 2000, options.interval ?? "30m", options.active ?? true]
  );
  await pool.query(`INSERT INTO endpoint_statistics (endpoint_id, last_checked) VALUES ($1, NOW())`, [rows[0].id]);
  return rows[0];
}

// Past successful checks, for latency baselines.
export async function addHistory(endpointId: number, samples: Array<{ minsAgo: number; ms: number }>): Promise<void> {
  for (const s of samples) {
    await pool.query(
      `INSERT INTO monitoring_results (endpoint_id, status, status_code, response_time, created_at)
       VALUES ($1, 'up', 200, $2, NOW() - make_interval(mins => $3))`,
      [endpointId, s.ms, s.minsAgo]
    );
  }
}

export async function addDownResult(endpointId: number, statusCode = 503): Promise<void> {
  await pool.query(
    `INSERT INTO monitoring_results (endpoint_id, status, status_code, response_time, error_message)
     VALUES ($1, 'down', $2, 10, $3)`,
    [endpointId, statusCode, `Expected status 200, got ${statusCode}`]
  );
}

export async function check(endpoint: Endpoint, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await executeCheck(endpoint);
}

export async function incidentsFor(endpointId: number) {
  const { rows } = await pool.query(`SELECT * FROM incidents WHERE endpoint_id = $1 ORDER BY id`, [endpointId]);
  return rows;
}

export async function timeline(incidentId: number) {
  const { rows } = await pool.query(`SELECT * FROM incident_timeline WHERE incident_id = $1 ORDER BY id`, [incidentId]);
  return rows;
}
