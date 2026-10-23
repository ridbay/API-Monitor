import type { PoolClient } from "pg";
import { pool } from "../config/db";
import type { ResolvedRequest } from "./logDiscovery.service";

const INSERT_CHUNK = 5000;
const UNDEFINED_TABLE = "42P01";
const DUPLICATE_TABLE = "42P07";
const UNIQUE_VIOLATION = "23505";

export function retentionDays(): number {
  return Number(process.env.ACCESS_LOG_RETENTION_DAYS) || 30;
}

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function partitionName(month: Date): string {
  return `access_logs_y${month.getUTCFullYear()}m${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Partitions known to exist in this process, so the hot path skips the DDL.
const knownPartitions = new Set<string>();

export async function ensurePartition(month: Date): Promise<void> {
  const start = monthStart(month);
  const name = partitionName(start);
  if (knownPartitions.has(name)) return;
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF access_logs FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`
    );
  } catch (err) {
    // Two consumers creating the same month at once: the loser sees a duplicate
    // table, or a unique violation on the catalog if they raced exactly.
    const code = (err as { code?: string }).code;
    if (code !== DUPLICATE_TABLE && code !== UNIQUE_VIOLATION) throw err;
  }
  knownPartitions.add(name);
}

export interface AccessLogRow extends ResolvedRequest {
  ts: Date;
}

// Picks the rows to store and makes sure their partitions exist. Records
// older than the retention window are dropped (they'd only be pruned again),
// and timestamps in the future are clamped to now so a skewed clock can't
// create far-off partitions. Partition DDL runs here, outside the insert's
// transaction, so concurrent writers don't block on it.
export async function prepareAccessLogs(requests: ResolvedRequest[]): Promise<AccessLogRow[]> {
  const now = Date.now();
  const cutoff = now - retentionDays() * 86_400_000;
  const rows = requests
    .map((r) => ({ ...r, ts: r.seenAt.getTime() > now + 86_400_000 ? new Date(now) : r.seenAt }))
    .filter((r) => r.ts.getTime() >= cutoff);

  const months = new Map<string, Date>();
  for (const r of rows) months.set(partitionName(monthStart(r.ts)), r.ts);
  for (const month of months.values()) await ensurePartition(month);
  return rows;
}

export async function insertAccessLogs(db: Pick<PoolClient, "query">, rows: AccessLogRow[], source: string): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    await db.query(
      `INSERT INTO access_logs (ts, host, method, path, path_template, status, latency_ms, service, pod, source)
       SELECT ts, host, method, path, path_template, status, latency_ms, service, pod, $10
       FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[], $6::smallint[], $7::int[], $8::text[], $9::text[])
         AS t(ts, host, method, path, path_template, status, latency_ms, service, pod)`,
      [
        chunk.map((r) => r.ts),
        chunk.map((r) => r.host),
        chunk.map((r) => r.method),
        chunk.map((r) => r.path),
        chunk.map((r) => r.template),
        chunk.map((r) => r.status),
        chunk.map((r) => (r.latencyMs === undefined ? null : Math.round(r.latencyMs))),
        chunk.map((r) => r.service ?? null),
        chunk.map((r) => r.pod ?? null),
        source,
      ]
    );
  }
}

// Creates this and next month's partitions ahead of time and drops whole
// months that have aged out of the retention window. Dropping a partition is
// instant, unlike DELETE on a large table.
export async function maintainPartitions(now = new Date()): Promise<{ dropped: string[] }> {
  await ensurePartition(now);
  await ensurePartition(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));

  const cutoff = new Date(now.getTime() - retentionDays() * 86_400_000);
  const { rows } = await pool.query<{ name: string; bound: string }>(
    `SELECT c.relname AS name, pg_get_expr(c.relpartbound, c.oid) AS bound
     FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent
     WHERE p.relname = 'access_logs'`
  );
  const dropped: string[] = [];
  for (const { name, bound } of rows) {
    const to = /TO \('([^']+)'\)/.exec(bound)?.[1];
    if (!to || new Date(to) > cutoff) continue;
    try {
      await pool.query(`DROP TABLE IF EXISTS ${name}`);
    } catch (err) {
      if ((err as { code?: string }).code !== UNDEFINED_TABLE) throw err;
    }
    knownPartitions.delete(name);
    dropped.push(name);
  }
  return { dropped };
}
