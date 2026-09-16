export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type MonitoringInterval = "1m" | "5m" | "15m" | "30m" | "1h";

export const INTERVAL_MS: Record<MonitoringInterval, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
};

export interface Endpoint {
  id: number;
  name: string;
  url: string;
  method: HttpMethod;
  expected_status: number;
  timeout: number;
  interval: MonitoringInterval;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
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
