import "./helpers/setup";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import type { KafkaMessage } from "kafkajs";
import { pool, prepareDatabase, resetDatabase } from "./helpers/db";
import { ensurePartition, maintainPartitions } from "../src/services/accessLogStore.service";
import { ingestLogs, listRoutes, parseLines, recordRequests } from "../src/services/logDiscovery.service";
import { processMessages } from "../src/services/logConsumer.service";

const clf = (host: string, path: string, status: number, time = "22/Oct/2026:10:00:00 +0000") =>
  `${host} 10.0.0.1 - - [${time}] "GET ${path} HTTP/1.1" ${status} 10 "-" "-" rt=0.010`;

const message = (value: string, headers: Record<string, string> = {}): KafkaMessage =>
  ({ value: Buffer.from(value), headers, key: null, offset: "0", timestamp: String(Date.now()), attributes: 0 }) as KafkaMessage;

async function accessLogCount(where = "TRUE"): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM access_logs WHERE ${where}`);
  return rows[0].n;
}

// File-level so it runs after every describe block below.
after(() => pool.end());

describe("access log storage", () => {
  before(prepareDatabase);
  beforeEach(resetDatabase);

  it("stores parsed requests in the month's partition", async () => {
    await ingestLogs([clf("a.svc", "/x/1", 200), clf("a.svc", "/x/2", 503)], {}, "test");
    const { rows } = await pool.query(`SELECT tableoid::regclass::text AS part, path_template, status, latency_ms, source FROM access_logs ORDER BY status`);
    assert.deepEqual(rows.map((r) => [r.part, r.path_template, r.status, r.latency_ms, r.source]), [
      ["access_logs_y2026m10", "/x/:id", 200, 10, "test"],
      ["access_logs_y2026m10", "/x/:id", 503, 10, "test"],
    ]);
  });

  it("drops records older than retention and clamps future timestamps to now", async () => {
    process.env.ACCESS_LOG_RETENTION_DAYS = "30";
    const old = "01/Jan/2020:00:00:00 +0000";
    const future = "01/Jan/2099:00:00:00 +0000";
    const result = await ingestLogs([clf("a.svc", "/old", 200, old), clf("a.svc", "/future", 200, future), clf("a.svc", "/now", 200)], {}, "test");
    assert.equal(result.lines_parsed, 3, "all three still count toward discovery");
    assert.equal(await accessLogCount(), 2);
    assert.equal(await accessLogCount(`path = '/future' AND ts < NOW() + interval '1 minute'`), 1);
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM pg_class WHERE relname LIKE 'access_logs_y2099%' OR relname LIKE 'access_logs_y2020%'`);
    assert.equal(rows[0].n, 0, "no far-off partitions created");
  });

  it("drops whole partitions that aged out, keeping current and next month", async () => {
    await ensurePartition(new Date("2025-01-15T00:00:00Z"));
    const now = new Date("2026-10-23T00:00:00Z");
    const { dropped } = await maintainPartitions(now);
    assert.ok(dropped.includes("access_logs_y2025m01"));
    const { rows } = await pool.query(`SELECT relname FROM pg_class WHERE relname IN ('access_logs_y2026m10', 'access_logs_y2026m11', 'access_logs_y2025m01')`);
    assert.deepEqual(rows.map((r) => r.relname).sort(), ["access_logs_y2026m10", "access_logs_y2026m11"]);
  });

  it("records concurrent overlapping batches exactly once each, without deadlocking", async () => {
    // Same routes in different orders across batches: the pattern that deadlocked before.
    const paths = Array.from({ length: 30 }, (_, i) => `/r${String.fromCharCode(97 + i % 26)}${i >= 26 ? "z" : ""}/1`);
    const batches = Array.from({ length: 8 }, (_, b) => {
      const order = b % 2 ? [...paths].reverse() : [...paths].sort(() => Math.random() - 0.5);
      return order.flatMap((p) => Array.from({ length: 5 }, () => clf("shared.svc", p, 200)));
    });
    await Promise.all(batches.map((lines, i) => recordRequests(parseLines(lines), `test-${i}`)));

    const routes = await listRoutes({ host: "shared.svc" });
    assert.equal(routes.length, 30);
    assert.ok(routes.every((r) => r.request_count === 8 * 5), "each route counted once per batch");
    assert.equal(await accessLogCount(), 8 * 30 * 5);
  });

  it("leaves nothing behind when a batch fails part-way", async () => {
    await pool.query(`
      CREATE OR REPLACE FUNCTION fail_batch() RETURNS trigger AS $$
      BEGIN IF NEW.source = 'boom' THEN RAISE EXCEPTION 'simulated failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_batch BEFORE INSERT ON log_ingest_batches FOR EACH ROW EXECUTE FUNCTION fail_batch();`);
    try {
      await assert.rejects(ingestLogs([clf("a.svc", "/x/1", 200)], {}, "boom"), /simulated failure/);
      assert.equal(await accessLogCount(), 0, "raw rows rolled back");
      assert.equal((await listRoutes({ host: "a.svc" })).length, 0, "catalog rolled back");
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS fail_batch ON log_ingest_batches; DROP FUNCTION IF EXISTS fail_batch();`);
    }
  });
});

describe("Kafka message processing", () => {
  before(prepareDatabase);
  beforeEach(resetDatabase);

  it("uses message headers as defaults for lines that lack them", async () => {
    await processMessages("telemetry.raw-logs", [
      message("GET /cart/1 200 3.0 ms - 2", { host: "cart.svc", service: "cart", pod: "cart-0" }),
      message("GET /cart/2 500 3.0 ms - 2", { host: "cart.svc", service: "cart", pod: "cart-1" }),
      message("GET /stock/9 200 3.0 ms - 2", { host: "stock.svc" }),
      message("not a log line"),
    ]);
    const [cart] = await listRoutes({ host: "cart.svc" });
    assert.equal(cart.path_template, "/cart/:id");
    assert.equal(cart.service_name, "cart");
    assert.deepEqual(cart.pods.sort(), ["cart-0", "cart-1"]);
    assert.equal(cart.error_rate_pct, 50);
    assert.equal((await listRoutes({ host: "stock.svc" })).length, 1);

    const { rows: [batch] } = await pool.query(`SELECT * FROM log_ingest_batches`);
    assert.equal(batch.source, "kafka:telemetry.raw-logs");
    assert.equal(batch.lines_received, 4);
    assert.equal(batch.lines_parsed, 3);
  });

  it("accepts pre-parsed JSON records on the access-logs topic", async () => {
    await processMessages("telemetry.access-logs", [
      message(JSON.stringify({ method: "GET", path: "/users/42", status: 200, host: "users.svc", duration_ms: 12, pod: "users-a" })),
    ]);
    const [users] = await listRoutes({ host: "users.svc" });
    assert.equal(users.path_template, "/users/:id");
    assert.equal(users.avg_latency_ms, 12);
  });
});

// Runs against a real broker only when TEST_KAFKA_BROKERS is set, e.g.
//   docker compose --profile kafka up -d kafka
//   TEST_KAFKA_BROKERS=localhost:29092 npm test
describe("Kafka end to end", { skip: !process.env.TEST_KAFKA_BROKERS && "set TEST_KAFKA_BROKERS to run" }, () => {
  let consumer: import("kafkajs").Consumer;
  let kafka: typeof import("../src/services/kafka.service");
  const prefix = `test-${crypto.randomBytes(4).toString("hex")}.`;

  before(async () => {
    await prepareDatabase();
    await resetDatabase();
    Object.assign(process.env, {
      KAFKA_BROKERS: process.env.TEST_KAFKA_BROKERS,
      KAFKA_TOPIC_PREFIX: prefix,
      KAFKA_CONSUMER_GROUP: `${prefix}consumer`,
      KAFKA_FROM_BEGINNING: "true",
      KAFKA_LOG_PARTITIONS: "3",
    });
    kafka = await import("../src/services/kafka.service");
    await kafka.ensureTopics();
    consumer = await (await import("../src/services/logConsumer.service")).startLogConsumer();
  });
  after(async () => {
    await consumer?.disconnect();
    await kafka?.disconnectProducer();
    if (kafka) {
      const admin = kafka.getKafka().admin();
      await admin.connect();
      const t = kafka.topics();
      await admin.deleteTopics({ topics: [t.rawLogs, t.accessLogs, t.events] }).catch(() => {});
      await admin.disconnect();
    }
    process.env.KAFKA_BROKERS = "";
  });

  it("consumes produced log lines into access_logs and discovery", async () => {
    const { stats } = await import("../src/services/logConsumer.service");
    // stats is module state shared with the processing tests above.
    const startCount = stats.requests_recorded;
    const producer = kafka.getKafka().producer(kafka.PRODUCER_DEFAULTS);
    await producer.connect();
    const lines = Array.from({ length: 300 }, (_, i) => `GET /orders/${i} ${i % 10 === 0 ? 503 : 200} 4.0 ms - 2`);
    await producer.send({ topic: kafka.topics().rawLogs, messages: lines.map((value) => ({ value, headers: { host: "orders.svc", service: "orders" } })) });
    await producer.disconnect();

    const deadline = Date.now() + 30_000;
    while (stats.requests_recorded - startCount < 300 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    assert.equal(stats.requests_recorded - startCount, 300);
    assert.equal(await accessLogCount(`host = 'orders.svc'`), 300);
    const [orders] = await listRoutes({ host: "orders.svc" });
    assert.equal(orders.request_count, 300);
    assert.equal(orders.error_rate_pct, 10);
  });

  it("publishes incident events to the events topic", async () => {
    const events = kafka.getKafka().consumer({ groupId: `${prefix}events` });
    await events.connect();
    await events.subscribe({ topics: [kafka.topics().events], fromBeginning: true });
    const received: any[] = [];
    await events.run({ eachMessage: async ({ message: m }) => void received.push(JSON.parse(m.value!.toString())) });

    const { createIncident } = await import("../src/services/incident.service");
    const incident = await createIncident({ service_name: "orders", title: "test", severity: "P3" });

    const deadline = Date.now() + 30_000;
    while (!received.some((e) => e.reference === incident.reference) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    await events.disconnect();
    const event = received.find((e) => e.reference === incident.reference);
    assert.equal(event?.type, "incident.triggered");
    assert.equal(event?.severity, "P3");
  });
});
