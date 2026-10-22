export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type MonitoringInterval = "1m" | "5m" | "15m" | "30m" | "1h";
export type EndpointStatus = "up" | "down" | "unknown";

export interface EndpointWithStats {
  id: number;
  name: string;
  url: string;
  method: HttpMethod;
  expected_status: number;
  timeout: number;
  interval: MonitoringInterval;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  status: EndpointStatus;
  last_checked: string | null;
  availability: string | number;
  avg_response_time: number;
}

export interface CreateEndpointInput {
  name: string;
  url: string;
  method: HttpMethod;
  expected_status: number;
  timeout: number;
  interval: MonitoringInterval;
}

export interface DashboardSummary {
  total_endpoints: number;
  healthy_endpoints: number;
  warning_endpoints: number;
  failed_endpoints: number;
  avg_response_time: number;
  recent_failures: RecentFailure[];
}

export type FailureCategory =
  | "timeout"
  | "dns"
  | "connection_refused"
  | "connection_reset"
  | "server_error"
  | "client_error"
  | "unknown";

export interface RootCause {
  category: FailureCategory;
  label: string;
}

export interface RecentFailure {
  id: number;
  endpoint_id: number;
  endpoint_name: string;
  status_code: number | null;
  error_message: string | null;
  created_at: string;
  likely_cause?: RootCause;
}

export interface TrendPoint {
  timestamp: string;
  avg_response_time: number;
  availability: number;
}

export interface EndpointHealth {
  endpoint_id: number;
  name: string;
  status: EndpointStatus;
  availability: number;
  avg_response_time: number;
  status_since: string | null;
}

export interface EndpointTrendPoint extends TrendPoint {
  up_count: number;
  down_count: number;
}

export interface StatusCodeCount {
  status_code: number;
  count: number;
}

export interface OutageItem {
  id: number;
  endpoint_id: number;
  endpoint_name: string;
  status_code: number | null;
  error_message: string | null;
  created_at: string;
  likely_cause?: RootCause;
}

export interface DailyReport {
  date: string;
  availability: number;
  avg_response_time: number;
  total_checks: number;
  failures: number;
  outages?: OutageItem[];
}

export interface WeeklyReport {
  top_fast_apis: Array<{ endpoint_id: number; name: string; avg_response_time: number }>;
  top_slow_apis: Array<{ endpoint_id: number; name: string; avg_response_time: number }>;
  top_slowest_apis?: Array<{ endpoint_id: number; name: string; avg_response_time: number }>;
  most_unstable_apis: Array<{ endpoint_id: number; name: string; success_rate: number }>;
  best_availability: Array<{ endpoint_id: number; name: string; availability: number }>;
}

export interface MonthlyReport {
  services_tracked: number;
  avg_uptime: number;
  incidents: number;
  currently_degraded: number;
  uptime_ranking: Array<{ endpoint_id: number; name: string; uptime: number }>;
}

export interface CsvPreviewRow {
  row: number;
  data?: CreateEndpointInput;
  error?: string;
}

export interface CsvPreviewResult {
  total: number;
  valid: number;
  invalid: number;
  rows: CsvPreviewRow[];
}

export interface DiscoveredEndpoint {
  name: string;
  url: string;
  method: HttpMethod;
}

export interface LoadTestOptions {
  concurrency: number;
  requestCount: number;
}

export interface LoadTestResult {
  endpoint_id: number;
  concurrency: number;
  request_count: number;
  success_count: number;
  failure_count: number;
  error_rate: number;
  duration_ms: number;
  throughput_rps: number;
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  status_code_breakdown: Record<string, number>;
  ran_at: string;
}

export interface ChatEntity {
  endpoint_id: number;
  name: string;
  status: EndpointStatus;
  detail: string;
}

export interface ChatResponse {
  intent: string;
  reply: string;
  entities?: ChatEntity[];
  suggestions?: string[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

// --- Phase 1: Topology Types ---
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

// --- Phase 1: Network Traceroute Types ---
export interface TracerouteHop {
  hopNumber: number;
  ip: string;
  hostname: string;
  rttMs: number;
  packetLossPct: number;
  status: "success" | "congested" | "timeout" | "unreachable";
  nodeType: "gateway" | "proxy" | "router" | "isp" | "cdn" | "target";
  asn?: string;
  location?: string;
}

export interface TracerouteResult {
  targetUrl: string;
  targetHost: string;
  resolvedIp: string;
  dnsLookupMs: number;
  totalHops: number;
  totalLatencyMs: number;
  bottleneckHop: number | null;
  status: "healthy" | "degraded" | "failed";
  summary: string;
  timestamp: string;
  hops: TracerouteHop[];
}

// --- Phase 1: Executive Summary Types ---
export interface BusinessDomainHealth {
  name: string;
  category: "financial" | "customer" | "infrastructure" | "partner";
  endpointCount: number;
  availabilityPct: number;
  avgLatencyMs: number;
  status: "healthy" | "degraded" | "down";
  activeIncidents: number;
  slaCommitmentPct: number;
}

export interface ExecutiveSummaryData {
  fleetAvailabilityPct: number;
  slaCommitmentPct: number;
  slaBreachRisk: "low" | "medium" | "high";
  mttdSeconds: number;
  mttrMinutes: number;
  totalEndpoints: number;
  totalServices: number;
  healthyCount: number;
  degradedCount: number;
  downCount: number;
  totalChecks24h: number;
  outageMinutesAvoided: number;
  businessDomains: BusinessDomainHealth[];
  trend30Days: Array<{
    date: string;
    availability: number;
    targetSla: number;
    incidentCount: number;
    avgLatency: number;
  }>;
  recentCriticalIncidents: Array<{
    id: string;
    serviceName: string;
    endpointUrl: string;
    durationMinutes: number;
    severity: "P1" | "P2" | "P3";
    rootCause: string;
    detectedAt: string;
    status: "RESOLVED" | "INVESTIGATING" | "MITIGATED";
  }>;
}

// --- Phase 2: Enterprise Incidents & Notifications ---
export type IncidentSeverity = "P1" | "P2" | "P3" | "P4";
export type IncidentStatus =
  | "TRIGGERED"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "MITIGATED"
  | "RESOLVED"
  | "CLOSED";

export interface IncidentTimelineEvent {
  id: number;
  incident_id: number;
  event_type: string;
  message: string;
  actor: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface NotificationLog {
  id: number;
  incident_id: number;
  channel: "EMAIL" | "SMS" | "SERVICENOW" | "SLACK" | "TEAMS";
  recipient: string;
  subject: string | null;
  content: string;
  status: "SENT" | "FAILED" | "QUEUED";
  created_at: string;
}

export interface NotificationConfig {
  id: number;
  name: string;
  channel: "EMAIL" | "SMS" | "SERVICENOW" | "SLACK" | "TEAMS";
  destination: string;
  min_severity: "P1" | "P2" | "P3" | "P4";
  is_active: boolean;
  created_at: string;
}

export interface Incident {
  id: number;
  reference: string;
  endpoint_id: number | null;
  service_name: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  root_cause: string | null;
  root_cause_category: string | null;
  affected_pods: string[] | null;
  servicenow_sys_id: string | null;
  servicenow_ticket_num: string | null;
  servicenow_status: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  mitigated_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  timeline?: IncidentTimelineEvent[];
  notifications?: NotificationLog[];
  rca?: RcaReport | null;
}

export type RcaConfidence = "high" | "medium" | "low";
export type RemediationRisk = "low" | "medium" | "high";

export interface RcaRecommendation {
  step: number;
  title: string;
  rationale: string;
  action: string;
  params: Record<string, unknown>;
  risk: RemediationRisk;
  requires?: "kubernetes";
}

export interface RcaReport {
  incident_id: number;
  incident_reference: string;
  generated_at: string;
  diagnosis: {
    category: string;
    summary: string;
    confidence: RcaConfidence;
    scope: "endpoint" | "service" | "fleet";
  };
  evidence: Array<{ signal: string; finding: string; abnormal: boolean }>;
  recommendations: RcaRecommendation[];
  signals_unavailable: string[];
}
