import axios from "axios";
import type {
  CreateEndpointInput,
  CsvPreviewResult,
  DailyReport,
  DashboardSummary,
  DiscoveredEndpoint,
  EndpointHealth,
  EndpointTrendPoint,
  EndpointWithStats,
  LoadTestOptions,
  LoadTestResult,
  MonthlyReport,
  StatusCodeCount,
  TrendPoint,
  WeeklyReport,
} from "../types";

export const api = axios.create({ baseURL: "/api" });

export const endpointsApi = {
  list: () => api.get<EndpointWithStats[]>("/endpoints").then((r) => r.data),
  getById: (id: number) => api.get<EndpointWithStats>(`/endpoints/${id}`).then((r) => r.data),
  create: (input: CreateEndpointInput) => api.post("/endpoints", input).then((r) => r.data),
  update: (id: number, input: Partial<CreateEndpointInput>) =>
    api.put(`/endpoints/${id}`, input).then((r) => r.data),
  remove: (id: number) => api.delete(`/endpoints/${id}`),
  trends: (id: number, hours = 24) =>
    api.get<EndpointTrendPoint[]>(`/endpoints/${id}/trends`, { params: { hours } }).then((r) => r.data),
  statusCodes: (id: number, hours = 24) =>
    api.get<StatusCodeCount[]>(`/endpoints/${id}/status-codes`, { params: { hours } }).then((r) => r.data),
  runCheck: (id: number) => api.post(`/endpoints/${id}/check`).then((r) => r.data),
  runAllChecks: () => api.post("/endpoints/check-all").then((r) => r.data),
};

export const monitorApi = {
  runOne: (id: number) => api.post(`/monitor/run/${id}`),
  runAll: () => api.post("/monitor/run-all"),
};

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>("/dashboard/summary").then((r) => r.data),
  trends: (hours = 24) => api.get<TrendPoint[]>("/dashboard/trends", { params: { hours } }).then((r) => r.data),
  endpointHealth: () => api.get<EndpointHealth[]>("/dashboard/endpoint-health").then((r) => r.data),
};

export const reportsApi = {
  daily: (date?: string) => api.get<DailyReport>("/reports/daily", { params: { date } }).then((r) => r.data),
  weekly: () => api.get<WeeklyReport>("/reports/weekly").then((r) => r.data),
  monthly: () => api.get<MonthlyReport>("/reports/monthly").then((r) => r.data),
};

export const importApi = {
  preview: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post<CsvPreviewResult>("/import/preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  confirm: (endpoints: CreateEndpointInput[]) =>
    api.post("/import/confirm", { endpoints }).then((r) => r.data),
};

export const openapiApi = {
  discover: (specUrl: string) =>
    api
      .post<{ total: number; endpoints: DiscoveredEndpoint[] }>("/openapi/discover", { specUrl })
      .then((r) => r.data),
  import: (endpoints: CreateEndpointInput[]) =>
    api.post("/openapi/import", { endpoints }).then((r) => r.data),
};

export const loadTestApi = {
  run: (id: number, options: LoadTestOptions) =>
    api.post<LoadTestResult>(`/load-test/${id}/run`, options).then((r) => r.data),
};
