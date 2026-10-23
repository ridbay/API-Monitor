import type { Consumer, KafkaMessage } from "kafkajs";
import { getKafka, topics } from "./kafka.service";
import { IngestDefaults, mergeBatches, parseLines, recordRequests } from "./logDiscovery.service";

// Consumes telemetry.raw-logs (one log line per message, any format the parser
// knows) and telemetry.access-logs (pre-parsed JSON records), stores them in
// access_logs and feeds endpoint discovery.
//
// Delivery is at-least-once: offsets are committed only after a chunk is in
// Postgres, so a crash mid-chunk replays it. A chunk that fails to record
// (e.g. Postgres down) throws, and kafkajs retries it rather than skipping.

const CHUNK_SIZE = Number(process.env.KAFKA_CONSUMER_CHUNK) || 5000;

export interface ConsumerStats {
  started_at: string | null;
  running: boolean;
  messages: number;
  requests_recorded: number;
  unparsed: number;
  chunks: number;
  last_chunk_at: string | null;
  last_error: string | null;
}

export const stats: ConsumerStats = {
  started_at: null,
  running: false,
  messages: 0,
  requests_recorded: 0,
  unparsed: 0,
  chunks: 0,
  last_chunk_at: null,
  last_error: null,
};

// Producers can tag messages with headers to fill in what a log line lacks
// (Fluent Bit's kafka output, or the produce script's --host/--service).
function defaultsFrom(message: KafkaMessage): IngestDefaults {
  const header = (key: string) => {
    const value = message.headers?.[key];
    return value === undefined ? undefined : String(Array.isArray(value) ? value[0] : value) || undefined;
  };
  return { host: header("host"), service: header("service"), pod: header("pod"), scheme: header("scheme") };
}

export async function processMessages(topic: string, messages: KafkaMessage[]): Promise<void> {
  const groups = new Map<string, { defaults: IngestDefaults; lines: string[] }>();
  for (const message of messages) {
    if (!message.value) continue;
    const defaults = defaultsFrom(message);
    const key = JSON.stringify(defaults);
    const group = groups.get(key) ?? { defaults, lines: [] };
    group.lines.push(message.value.toString("utf-8"));
    groups.set(key, group);
  }

  const batch = mergeBatches([...groups.values()].map((g) => parseLines(g.lines, g.defaults)));
  if (batch.requests.length || batch.unparsed) {
    const result = await recordRequests(batch, `kafka:${topic}`);
    stats.requests_recorded += result.lines_parsed;
    stats.unparsed += result.lines_unparsed;
  }
  stats.messages += messages.length;
  stats.chunks++;
  stats.last_chunk_at = new Date().toISOString();
}

export async function startLogConsumer(): Promise<Consumer> {
  const consumer = getKafka().consumer({
    groupId: process.env.KAFKA_CONSUMER_GROUP || "api-monitor-log-consumer",
    // Bounded fetches are the backpressure: the next fetch waits until this
    // batch has been written.
    maxBytes: Number(process.env.KAFKA_CONSUMER_MAX_BYTES) || 10 * 1024 * 1024,
    sessionTimeout: 30_000,
  });
  consumer.on(consumer.events.CRASH, (e) => {
    stats.last_error = e.payload.error.message;
    stats.running = false;
  });

  await consumer.connect();
  const t = topics();
  await consumer.subscribe({ topics: [t.rawLogs, t.accessLogs], fromBeginning: process.env.KAFKA_FROM_BEGINNING === "true" });
  await consumer.run({
    partitionsConsumedConcurrently: Number(process.env.KAFKA_CONSUMER_CONCURRENCY) || 3,
    eachBatchAutoResolve: false,
    eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary, isRunning, isStale }) => {
      for (let i = 0; i < batch.messages.length; i += CHUNK_SIZE) {
        if (!isRunning() || isStale()) break;
        const chunk = batch.messages.slice(i, i + CHUNK_SIZE);
        try {
          await processMessages(batch.topic, chunk);
        } catch (err) {
          stats.last_error = (err as Error).message;
          throw err;
        }
        resolveOffset(chunk[chunk.length - 1].offset);
        await heartbeat();
        await commitOffsetsIfNecessary();
      }
    },
  });

  stats.started_at = new Date().toISOString();
  stats.running = true;
  stats.last_error = null;
  return consumer;
}
