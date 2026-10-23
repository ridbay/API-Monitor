import { Kafka, KafkaConfig, logLevel, Partitioners, Producer, ProducerConfig, SASLOptions } from "kafkajs";

// Kafka is optional: with KAFKA_BROKERS unset, the app ingests over HTTP only
// and publishEvent() is a no-op.

// KAFKA_TOPIC_PREFIX namespaces the topics, e.g. per environment on a shared
// cluster ("staging." → staging.telemetry.raw-logs).
export function topics() {
  const prefix = process.env.KAFKA_TOPIC_PREFIX ?? "";
  return {
    rawLogs: `${prefix}telemetry.raw-logs`,
    accessLogs: `${prefix}telemetry.access-logs`,
    events: `${prefix}telemetry.events`,
  };
}

export const PRODUCER_DEFAULTS: ProducerConfig = {
  allowAutoTopicCreation: false,
  createPartitioner: Partitioners.DefaultPartitioner,
};

export function kafkaEnabled(): boolean {
  return Boolean(process.env.KAFKA_BROKERS);
}

let kafka: Kafka | null = null;

export function getKafka(): Kafka {
  if (!kafkaEnabled()) throw new Error("Kafka is not configured (set KAFKA_BROKERS)");
  if (kafka) return kafka;

  const config: KafkaConfig = {
    clientId: process.env.KAFKA_CLIENT_ID || "api-monitor",
    brokers: process.env.KAFKA_BROKERS!.split(",").map((b) => b.trim()),
    logLevel: logLevel.WARN,
    retry: { retries: 8, initialRetryTime: 300 },
  };
  // AMQ Streams / Strimzi on OpenShift usually means TLS, often with SCRAM.
  if (process.env.KAFKA_SSL === "true") config.ssl = true;
  const mechanism = process.env.KAFKA_SASL_MECHANISM as "plain" | "scram-sha-256" | "scram-sha-512" | undefined;
  if (mechanism) {
    config.sasl = {
      mechanism,
      username: process.env.KAFKA_SASL_USERNAME ?? "",
      password: process.env.KAFKA_SASL_PASSWORD ?? "",
    } as SASLOptions;
  }
  kafka = new Kafka(config);
  return kafka;
}

// Idempotent: existing topics are left as they are.
export async function ensureTopics(): Promise<void> {
  const admin = getKafka().admin();
  await admin.connect();
  try {
    const replicationFactor = Number(process.env.KAFKA_REPLICATION_FACTOR) || 1;
    const partitions = Number(process.env.KAFKA_LOG_PARTITIONS) || 6;
    const t = topics();
    await admin.createTopics({
      waitForLeaders: true,
      topics: [
        { topic: t.rawLogs, numPartitions: partitions, replicationFactor },
        { topic: t.accessLogs, numPartitions: partitions, replicationFactor },
        { topic: t.events, numPartitions: 3, replicationFactor },
      ],
    });
  } finally {
    await admin.disconnect();
  }
}

let producer: Promise<Producer> | null = null;

function getProducer(): Promise<Producer> {
  if (!producer) {
    const p = getKafka().producer(PRODUCER_DEFAULTS);
    producer = p.connect().then(() => p);
    producer.catch(() => {
      producer = null;
    });
  }
  return producer;
}

// Fire-and-forget domain event (incident.triggered, route.discovered, ...).
// Events are a side channel for downstream consumers; failing to publish one
// must never fail the operation that produced it.
export function publishEvent(type: string, payload: Record<string, unknown>): void {
  if (!kafkaEnabled()) return;
  getProducer()
    .then((p) =>
      p.send({
        topic: topics().events,
        messages: [{ key: type, value: JSON.stringify({ type, at: new Date().toISOString(), ...payload }) }],
      })
    )
    .catch((err) => console.warn(`Could not publish ${type} event:`, (err as Error).message));
}

export async function disconnectProducer(): Promise<void> {
  if (!producer) return;
  const p = await producer.catch(() => null);
  producer = null;
  await p?.disconnect();
}
