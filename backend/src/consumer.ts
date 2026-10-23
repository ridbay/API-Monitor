// Entrypoint for the kafka-log-consumer service: runs the Kafka log consumer
// and access-log partition maintenance, plus a small HTTP server for probes.
// Deployed from the same image as the API with a different command.
import http from "http";
import { pool } from "./config/db";
import { maintainPartitions } from "./services/accessLogStore.service";
import { ensureTopics, kafkaEnabled } from "./services/kafka.service";
import { startLogConsumer, stats } from "./services/logConsumer.service";

const PORT = Number(process.env.CONSUMER_PORT) || 4002;
const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function main() {
  if (!kafkaEnabled()) {
    console.error("KAFKA_BROKERS is not set; nothing to consume.");
    process.exit(1);
  }

  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "ok" }));
    } else if (req.url === "/ready") {
      const ready = stats.running && (await pool.query("SELECT 1").then(() => true, () => false));
      res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" }).end(JSON.stringify({ ready, ...stats }));
    } else {
      res.writeHead(404).end();
    }
  });
  server.listen(PORT, () => console.log(`Log consumer probes on :${PORT} (/health, /ready)`));

  await ensureTopics();
  await maintainPartitions().catch((err) => console.warn("Partition maintenance failed:", err));
  setInterval(() => maintainPartitions().catch((err) => console.warn("Partition maintenance failed:", err)), MAINTENANCE_INTERVAL_MS);

  const consumer = await startLogConsumer();
  console.log("Kafka log consumer running.");

  const shutdown = async (signal: string) => {
    console.log(`${signal}: stopping consumer…`);
    stats.running = false;
    await consumer.disconnect().catch(() => {});
    server.close();
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Log consumer failed to start:", err);
  process.exit(1);
});
