import fs from "fs";
import path from "path";
import { Client } from "pg";
import { pool } from "../../src/config/db";

const SCHEMA = fs.readFileSync(path.join(__dirname, "../../src/config/schema.sql"), "utf-8");

function databaseName(): string {
  return new URL(process.env.DATABASE_URL!).pathname.slice(1);
}

// Creates the test database if needed and applies the schema. Call once per
// test file in before().
export async function prepareDatabase(): Promise<void> {
  const name = databaseName();
  // Every test truncates the database it points at; never let that be a real one.
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to run tests against database "${name}": its name must contain "test"`);
  }

  const adminUrl = new URL(process.env.DATABASE_URL!);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }

  // Serialize schema setup across test processes that start at the same time.
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(72201)");
    await client.query(SCHEMA);
  } finally {
    await client.query("SELECT pg_advisory_unlock(72201)").catch(() => {});
    client.release();
  }
}

// Empties every table and restarts sequences. Call in beforeEach().
export async function resetDatabase(): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  if (rows.length) {
    await pool.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  await pool.query(`ALTER SEQUENCE IF EXISTS remediation_ref_seq RESTART`);
}

export { pool };
