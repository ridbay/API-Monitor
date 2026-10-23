import axios from "axios";
import type {
  ChatResponse,
  ChatTurn,
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
  TopologyData,
  TracerouteResult,
  ExecutiveSummaryData,
  Incident,
  IncidentStatus,
  NotificationLog,
  NotificationConfig,
  RcaReport,
  RemediationPlan,
  AutopilotSettings,
  DiscoveredRoute,
  DiscoverySummary,
  LogIngestResult,
  IngestDefaults,
  LoadSuite,
  LoadRun,
  SuiteInput,
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

export const chatApi = {
  send: (message: string, history?: ChatTurn[]) =>
    api.post<ChatResponse>("/chat/message", { message, history }).then((r) => r.data),
};

export const topologyApi = {
  get: () => api.get<TopologyData>("/topology").then((r) => r.data),
};

export const tracerouteApi = {
  getByEndpointId: (id: number) => api.get<TracerouteResult>(`/traceroute/${id}`).then((r) => r.data),
  run: (target: string | number) => api.post<TracerouteResult>("/traceroute/run", { target }).then((r) => r.data),
};

export const executiveApi = {
  getSummary: () => api.get<ExecutiveSummaryData>("/executive/summary").then((r) => r.data),
};

export const loadSuiteApi = {
  listSuites: () => api.get<LoadSuite[]>("/load-suites/suites").then((r) => r.data),
  createSuite: (input: SuiteInput) => api.post<LoadSuite>("/load-suites/suites", input).then((r) => r.data),
  updateSuite: (id: number, input: SuiteInput) => api.put<LoadSuite>(`/load-suites/suites/${id}`, input).then((r) => r.data),
  deleteSuite: (id: number) => api.delete(`/load-suites/suites/${id}`),
  run: (id: number) => api.post<LoadRun>(`/load-suites/suites/${id}/run`).then((r) => r.data),
  cancel: (runId: number) => api.post(`/load-suites/runs/${runId}/cancel`),
  listRuns: () => api.get<LoadRun[]>("/load-suites/runs").then((r) => r.data),
  streamUrl: (runId: number) => `/api/load-suites/runs/${runId}/stream`,
};

export const discoveryApi = {
  listRoutes: (params: { status?: string; q?: string }) =>
    api.get<DiscoveredRoute[]>("/discovery/routes", { params }).then((r) => r.data),
  summary: () => api.get<DiscoverySummary>("/discovery/summary").then((r) => r.data),
  ingestText: (text: string, defaults: IngestDefaults) =>
    api.post<LogIngestResult>("/discovery/ingest", { text, defaults }).then((r) => r.data),
  uploadFile: (file: File, defaults: IngestDefaults) => {
    const form = new FormData();
    form.append("file", file);
    if (defaults.host) form.append("host", defaults.host);
    if (defaults.service) form.append("service", defaults.service);
    return api.post<LogIngestResult>("/discovery/upload", form).then((r) => r.data);
  },
  promote: (id: number, overrides: { url?: string; name?: string }) =>
    api.post(`/discovery/routes/${id}/promote`, overrides).then((r) => r.data),
  ignore: (id: number) => api.post<DiscoveredRoute>(`/discovery/routes/${id}/ignore`).then((r) => r.data),
  restore: (id: number) => api.post<DiscoveredRoute>(`/discovery/routes/${id}/restore`).then((r) => r.data),
};

export const remediationApi = {
  approve: (reference: string, actor: string, note?: string) =>
    api.post<RemediationPlan>(`/remediation/plans/${reference}/approve`, { actor, note }).then((r) => r.data),
  reject: (reference: string, actor: string, note?: string) =>
    api.post<RemediationPlan>(`/remediation/plans/${reference}/reject`, { actor, note }).then((r) => r.data),
  getAutopilot: () => api.get<AutopilotSettings>("/remediation/autopilot").then((r) => r.data),
  setAutopilot: (action: string, enabled: boolean, actor: string) =>
    api.put<AutopilotSettings>(`/remediation/autopilot/${action}`, { enabled, actor }).then((r) => r.data),
};

export const incidentsApi = {
  list: (params?: { status?: string; severity?: string }) =>
    api.get<Incident[]>("/incidents", { params }).then((r) => r.data),
  getById: (idOrRef: string | number) =>
    api.get<Incident & { notifications: NotificationLog[] }>(`/incidents/${idOrRef}`).then((r) => r.data),
  updateStatus: (idOrRef: string | number, status: IncidentStatus, note?: string) =>
    api.patch<Incident>(`/incidents/${idOrRef}/status`, { status, note }).then((r) => r.data),
  addTimelineNote: (id: number, message: string) =>
    api.post(`/incidents/${id}/timeline`, { message }).then((r) => r.data),
  runRca: (id: number) => api.post<RcaReport>(`/incidents/${id}/rca`).then((r) => r.data),
  getNotificationLogs: (incidentId?: number) =>
    api.get<NotificationLog[]>("/notifications/logs", { params: { incidentId } }).then((r) => r.data),
  getNotificationConfigs: () =>
    api.get<NotificationConfig[]>("/notifications/configs").then((r) => r.data),
};
