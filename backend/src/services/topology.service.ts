import { pool } from "../config/db";

export interface TopologyNode {
  id: string;
  name: string;
  type: "ingress" | "service" | "pod" | "database" | "cache" | "broker" | "external";
  status: "up" | "degraded" | "down";
  latencyMs: number;
  uptimePct: number;
  rps: number;
  podCount?: number;
  namespace?: string;
  cluster?: string;
  description: string;
  endpoints: Array<{
    id: number;
    name: string;
    url: string;
    method: string;
    status: "up" | "down";
    latency: number;
  }>;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  protocol: "HTTP/REST" | "TCP" | "POSTGRES" | "REDIS" | "KAFKA";
  status: "healthy" | "degraded" | "failed";
  rps: number;
  avgLatencyMs: number;
  errorRatePct: number;
}

export interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  summary: {
    totalNodes: number;
    healthyNodes: number;
    degradedNodes: number;
    downNodes: number;
    totalEdges: number;
    overallHealthPct: number;
    criticalPathLatencyMs: number;
  };
}

export async function getServiceTopology(): Promise<TopologyData> {
  const query = `
    SELECT 
      e.id, 
      e.name, 
      e.url, 
      e.method, 
      e.is_active,
      COALESCE(s.availability, 0) as availability,
      COALESCE(s.avg_response_time, 0) as avg_response_time,
      COALESCE(mr.status, 'up') as current_status,
      COALESCE(mr.response_time, s.avg_response_time, 45) as current_latency
    FROM endpoints e
    LEFT JOIN endpoint_statistics s ON s.endpoint_id = e.id
    LEFT JOIN LATERAL (
      SELECT status, response_time
      FROM monitoring_results
      WHERE endpoint_id = e.id
      ORDER BY created_at DESC
      LIMIT 1
    ) mr ON true
    WHERE e.deleted_at IS NULL
    ORDER BY e.id ASC
  `;

  const { rows } = await pool.query(query);

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];

  // 1. Core Ingress Router Node (OpenShift Router / Nginx Ingress)
  nodes.push({
    id: "edge-ingress",
    name: "OpenShift Router / Edge Ingress",
    type: "ingress",
    status: "up",
    latencyMs: 4,
    uptimePct: 99.99,
    rps: 124,
    podCount: 3,
    namespace: "openshift-ingress",
    cluster: "prod-cluster-01",
    description: "HAProxy/Envoy edge routing and TLS termination layer",
    endpoints: [],
  });

  // 2. Data Stores & Infrastructure
  nodes.push({
    id: "infra-postgres",
    name: "PostgreSQL Primary Cluster",
    type: "database",
    status: "up",
    latencyMs: 6,
    uptimePct: 99.98,
    rps: 86,
    podCount: 2,
    namespace: "infra-data",
    cluster: "prod-cluster-01",
    description: "High-availability state persistence and time-series telemetry store",
    endpoints: [],
  });

  nodes.push({
    id: "infra-redis",
    name: "Redis Cluster (Cache/Locks)",
    type: "cache",
    status: "up",
    latencyMs: 1,
    uptimePct: 99.99,
    rps: 195,
    podCount: 3,
    namespace: "infra-cache",
    cluster: "prod-cluster-01",
    description: "In-memory caching, distributed locks and real-time fleet aggregates",
    endpoints: [],
  });

  nodes.push({
    id: "infra-kafka",
    name: "Kafka Ingestion Broker",
    type: "broker",
    status: "up",
    latencyMs: 8,
    uptimePct: 99.95,
    rps: 450,
    podCount: 3,
    namespace: "infra-messaging",
    cluster: "prod-cluster-01",
    description: "High-throughput telemetry & access log streaming broker",
    endpoints: [],
  });

  // Group endpoints by host domain / logical service
  const serviceGroups = new Map<string, typeof rows>();

  for (const row of rows) {
    let hostname = "internal-service";
    try {
      const parsedUrl = new URL(row.url);
      hostname = parsedUrl.hostname;
    } catch {
      hostname = "internal-service";
    }

    if (!serviceGroups.has(hostname)) {
      serviceGroups.set(hostname, []);
    }
    serviceGroups.get(hostname)!.push(row);
  }

  // Build service nodes and connect them
  let serviceIdx = 1;
  for (const [hostname, groupRows] of serviceGroups.entries()) {
    const isExternal = hostname.includes("github.com") || hostname.includes("google.com");
    const serviceId = `svc-${hostname.replace(/[^a-zA-Z0-9]/g, "-")}`;

    const totalAvail = groupRows.reduce((acc, r) => acc + Number(r.availability), 0) / groupRows.length;
    const avgLatency = Math.round(groupRows.reduce((acc, r) => acc + Number(r.current_latency || r.avg_response_time || 50), 0) / groupRows.length);
    const hasDown = groupRows.some((r) => r.current_status === "down" || Number(r.availability) < 40);
    const hasDegraded = groupRows.some((r) => Number(r.availability) < 90 || avgLatency > 700);

    let status: TopologyNode["status"] = "up";
    if (hasDown) {
      status = "down";
    } else if (hasDegraded) {
      status = "degraded";
    }

    const friendlyName = hostname.replace("www.", "").toUpperCase();

    nodes.push({
      id: serviceId,
      name: `${friendlyName} Microservice`,
      type: isExternal ? "external" : "service",
      status,
      latencyMs: avgLatency,
      uptimePct: Number(totalAvail.toFixed(2)),
      rps: Math.max(12, Math.round(35 + serviceIdx * 8)),
      podCount: isExternal ? undefined : Math.max(2, Math.min(6, groupRows.length * 2)),
      namespace: isExternal ? undefined : "production-apps",
      cluster: "prod-cluster-01",
      description: `${groupRows.length} endpoints routed under ${hostname}`,
      endpoints: groupRows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        url: r.url,
        method: r.method,
        status: r.current_status === "down" ? "down" : "up",
        latency: Number(r.current_latency),
      })),
    });

    // Ingress -> Service edge
    const edgeStatus: TopologyEdge["status"] = status === "down" ? "failed" : status === "degraded" ? "degraded" : "healthy";
    const errorRate = status === "down" ? 100 : status === "degraded" ? 12.5 : 0;

    edges.push({
      id: `edge-ingress-to-${serviceId}`,
      source: "edge-ingress",
      target: serviceId,
      protocol: "HTTP/REST",
      status: edgeStatus,
      rps: Math.max(15, Math.round(30 + serviceIdx * 5)),
      avgLatencyMs: avgLatency,
      errorRatePct: errorRate,
    });

    // If internal service, connect to DB and Redis
    if (!isExternal) {
      edges.push({
        id: `edge-${serviceId}-to-db`,
        source: serviceId,
        target: "infra-postgres",
        protocol: "POSTGRES",
        status: "healthy",
        rps: Math.round(20 + serviceIdx * 4),
        avgLatencyMs: 6,
        errorRatePct: 0,
      });

      edges.push({
        id: `edge-${serviceId}-to-redis`,
        source: serviceId,
        target: "infra-redis",
        protocol: "REDIS",
        status: "healthy",
        rps: Math.round(45 + serviceIdx * 10),
        avgLatencyMs: 2,
        errorRatePct: 0,
      });

      edges.push({
        id: `edge-${serviceId}-to-kafka`,
        source: serviceId,
        target: "infra-kafka",
        protocol: "KAFKA",
        status: "healthy",
        rps: Math.round(50 + serviceIdx * 12),
        avgLatencyMs: 5,
        errorRatePct: 0,
      });
    }

    serviceIdx++;
  }

  const healthyNodes = nodes.filter((n) => n.status === "up").length;
  const degradedNodes = nodes.filter((n) => n.status === "degraded").length;
  const downNodes = nodes.filter((n) => n.status === "down").length;

  const overallHealthPct = nodes.length > 0 
    ? Math.round(((healthyNodes + degradedNodes * 0.5) / nodes.length) * 100) 
    : 100;

  const criticalPathLatencyMs = Math.max(...nodes.map((n) => n.latencyMs), 15);

  return {
    nodes,
    edges,
    summary: {
      totalNodes: nodes.length,
      healthyNodes,
      degradedNodes,
      downNodes,
      totalEdges: edges.length,
      overallHealthPct,
      criticalPathLatencyMs,
    },
  };
}
