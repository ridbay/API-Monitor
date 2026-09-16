export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type MonitoringInterval = "1m" | "5m" | "15m" | "30m" | "1h";

export interface Endpoint {
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
}

export interface EndpointWithStats extends Endpoint {
  status: "up" | "down" | "unknown";
  last_checked: string | null;
  availability: number;
  avg_response_time: number;
}

export interface MonitoringResult {
  id: number;
  endpoint_id: number;
  status: "up" | "down";
  status_code: number | null;
  response_time: number | null;
  error_message: string | null;
  created_at: string;
}

export interface EndpointStatistics {
  id: number;
  endpoint_id: number;
  availability: number;
  success_rate: number;
  avg_response_time: number;
  last_checked: string | null;
}

export interface DashboardSummary {
  total_endpoints: number;
  healthy_endpoints: number;
  warning_endpoints: number;
  failed_endpoints: number;
  avg_response_time: number;
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
