// Replays a log file into Kafka, for demos and load-testing the consumer:
//   npm run kafka:produce -- --file ../dev/sample-logs/access-log-sample.txt --rate 500 --host inventory.prod.svc
// Options: --file (required), --rate lines/sec (default 500), --topic
// (default telemetry.raw-logs), --host/--service/--pod (sent as headers for
// lines that lack them), --loop (repeat until interrupted).
import fs from "fs";
import { getKafka, PRODUCER_DEFAULTS, topics } from "../services/kafka.service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = arg("file");
  if (!file) throw new Error("--file is required");
  const rate = Number(arg("rate") ?? 500);
  const topic = arg("topic") ?? topics().rawLogs;
  const loop = process.argv.includes("--loop");
  const headers: Record<string, string> = {};
  for (const key of ["host", "service", "pod"]) {
    const value = arg(key);
    if (value) headers[key] = value;
  }

  const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/).filter((l) => l.trim());
  const producer = getKafka().producer(PRODUCER_DEFAULTS);
  await producer.connect();

  const perTick = Math.max(1, Math.round(rate / 10));
  let sent = 0;
  do {
    for (let i = 0; i < lines.length; i += perTick) {
      const started = Date.now();
      await producer.send({ topic, messages: lines.slice(i, i + perTick).map((value) => ({ value, headers })) });
      sent += Math.min(perTick, lines.length - i);
      await new Promise((r) => setTimeout(r, Math.max(0, 100 - (Date.now() - started))));
    }
    console.log(`Sent ${sent} lines to ${topic}`);
  } while (loop);

  await producer.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
