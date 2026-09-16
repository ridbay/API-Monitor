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

export interface RecentFailure {
  id: number;
  endpoint_id: number;
  endpoint_name: string;
  status_code: number | null;
  error_message: string | null;
  created_at: string;
}

export interface TrendPoint {
  timestamp: string;
  avg_response_time: number;
  availability: number;
}

export interface EndpointTrendPoint extends TrendPoint {
  up_count: number;
  down_count: number;
}

export interface StatusCodeCount {
  status_code: number;
  count: number;
}

export interface DailyReport {
  date: string;
  availability: number;
  avg_response_time: number;
  total_checks: number;
  failures: number;
}

export interface WeeklyReport {
  top_fast_apis: Array<{ endpoint_id: number; name: string; avg_response_time: number }>;
  most_unstable_apis: Array<{ endpoint_id: number; name: string; success_rate: number }>;
  best_availability: Array<{ endpoint_id: number; name: string; availability: number }>;
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
