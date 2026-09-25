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
