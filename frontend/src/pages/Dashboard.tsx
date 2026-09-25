import { useState, useEffect, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Gauge,
  Globe,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  UploadCloud,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { ChartContainer } from "../components/ui/ChartContainer";
import { Table, Tbody, Td, Th, Thead } from "../components/ui/Table";
import { Button } from "../components/ui/Button";
import { useDashboardSummary, useEndpointHealth, useDashboardTrends } from "../hooks/useDashboard";
import { useRunAllChecks } from "../hooks/useEndpoints";
import { chartAxisProps, chartGridProps, chartTooltipProps, CHART_COLORS } from "../lib/chartTheme";
import { formatDuration } from "../lib/duration";
import { ROOT_CAUSE_SHORT_LABEL, ROOT_CAUSE_TONE } from "../lib/rootCause";
import type { EndpointHealth } from "../types";

const COLORS = { Healthy: CHART_COLORS.success, Warning: CHART_COLORS.warning, Down: CHART_COLORS.failure };

type Tone = "brand" | "success" | "failure" | "accent";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-500/10 text-brand-300",
  success: "bg-success-500/10 text-success-400",
  failure: "bg-failure-500/10 text-failure-400",
  accent: "bg-accent-500/10 text-accent-400",
};

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Globe;
  tone: Tone;
}) {
  return (
    <Card className="flex items-start justify-between">
      <div>
        <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
        <p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--color-text)]">{value}</p>
      </div>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>
        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
      </div>
    </Card>
  );
}

function healthTone(entry: EndpointHealth): "success" | "warning" | "failure" | "neutral" {
  if (entry.status === "down") return "failure";
  if (entry.status === "unknown") return "neutral";
  return entry.availability < 98 ? "warning" : "success";
}

const BAR_TONE_CLASSES: Record<string, string> = {
  success: "bg-success-500",
  warning: "bg-warning-500",
  failure: "bg-failure-500",
  neutral: "bg-[var(--color-text-faint)]",
};

const DOT_TONE_CLASSES: Record<string, string> = {
  success: "bg-success-400",
  warning: "bg-warning-400",
  failure: "bg-failure-400",
  neutral: "bg-[var(--color-text-faint)]",
};

function EndpointHealthRow({ entry }: { entry: EndpointHealth }) {
  const tone = healthTone(entry);
  const durationLabel = entry.status === "down" ? "Down for" : entry.status === "up" ? "Up for" : "";

  return (
    <div className="flex items-center gap-4 py-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_TONE_CLASSES[tone]}`} />
      <Link
        to={`/endpoints/${entry.endpoint_id}`}
        className="w-40 shrink-0 truncate text-sm font-medium text-[var(--color-text)] hover:text-brand-300 hover:underline"
      >
        {entry.name}
      </Link>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div
          className={`h-full rounded-full ${BAR_TONE_CLASSES[tone]}`}
          style={{ width: `${Math.min(100, Math.max(entry.availability, 2))}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-sm tabular-nums text-[var(--color-text-muted)]">
        {entry.availability.toFixed(1)}%
      </span>
      <span className="w-32 shrink-0 text-right text-xs text-[var(--color-text-faint)]">
        {durationLabel} {formatDuration(entry.status_since)}
      </span>
    </div>
  );
}

const STATUS_SORT_ORDER: Record<string, number> = { down: 0, unknown: 1, up: 2 };

type HealthFilter = "all" | "issues" | "healthy";

function EndpointHealthList({ className = "" }: { className?: string } = {}) {
  const { data: health, isLoading } = useEndpointHealth();
  const [filter, setFilter] = useState<HealthFilter>("all");
  const [query, setQuery] = useState("");

  const items = health ?? [];
  const issuesCount = useMemo(
    () => items.filter((e) => e.status === "down" || e.availability < 98).length,
    [items]
  );
  const healthyCount = useMemo(
    () => items.filter((e) => e.status === "up" && e.availability >= 98).length,
    [items]
  );

  const filtered = useMemo(() => {
    return items
      .filter((entry) => {
        if (filter === "issues") return entry.status === "down" || entry.availability < 98;
        if (filter === "healthy") return entry.status === "up" && entry.availability >= 98;
        return true;
      })
      .filter((entry) => {
        if (!query.trim()) return true;
        return entry.name.toLowerCase().includes(query.toLowerCase());
      })
      .sort((a, b) => {
        const statusDiff = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
        if (statusDiff !== 0) return statusDiff;
        return a.availability - b.availability;
      });
  }, [items, filter, query]);

  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Endpoint Health</h3>
          <span className="text-xs text-[var(--color-text-faint)]">Success rate &amp; current streak</span>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5 text-xs">
          <button
            onClick={() => setFilter("all")}
            className={`rounded px-2 py-1 transition-colors ${
              filter === "all"
                ? "bg-[var(--color-surface)] font-medium text-[var(--color-text)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            All ({items.length})
          </button>
          <button
            onClick={() => setFilter("issues")}
            className={`rounded px-2 py-1 transition-colors ${
              filter === "issues"
                ? "bg-failure-500/20 font-medium text-failure-300 shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-failure-400"
            }`}
          >
            Issues ({issuesCount})
          </button>
          <button
            onClick={() => setFilter("healthy")}
            className={`rounded px-2 py-1 transition-colors ${
              filter === "healthy"
                ? "bg-success-500/20 font-medium text-success-300 shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-success-400"
            }`}
          >
            Healthy ({healthyCount})
          </button>
        </div>
      </div>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--color-text-faint)]" />
        <input
          type="text"
          placeholder="Filter by endpoint name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] pl-8 pr-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-brand-400 focus:outline-none"
        />
      </div>

      {isLoading ? (
        <p className="py-6 text-sm text-[var(--color-text-muted)]">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--color-text-faint)]">
          {items.length === 0 ? "No endpoints yet" : "No endpoints match your filter"}
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto divide-y divide-[var(--color-border)] pr-1">
          {filtered.map((entry) => (
            <EndpointHealthRow key={entry.endpoint_id} entry={entry} />
          ))}
        </div>
      )}
    </Card>
  );
}

const TREND_RANGES = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
  { label: "30d", hours: 24 * 30 },
];

function PerformanceTrendsSection() {
  const [rangeHours, setRangeHours] = useState(24);
  const [metric, setMetric] = useState<"latency" | "availability">("latency");
  const { data: trends, isLoading } = useDashboardTrends(rangeHours);

  const chartData = useMemo(() => {
    return (trends ?? []).map((point) => {
      const date = new Date(point.timestamp);
      const label =
        rangeHours <= 24
          ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : date.toLocaleDateString([], { month: "short", day: "numeric" });
      return {
        ...point,
        label,
      };
    });
  }, [trends, rangeHours]);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-[var(--color-text)]">System Performance Trends</h3>
          </div>
          <p className="text-xs text-[var(--color-text-faint)]">
            Hourly aggregate latency and availability across all monitored endpoints
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Metric Selector */}
          <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5 text-xs">
            <button
              onClick={() => setMetric("latency")}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                metric === "latency"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              Latency (ms)
            </button>
            <button
              onClick={() => setMetric("availability")}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                metric === "availability"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              Availability (%)
            </button>
          </div>

          {/* Range Selector */}
          <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5 text-xs">
            {TREND_RANGES.map((r) => (
              <button
                key={r.hours}
                onClick={() => setRangeHours(r.hours)}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  rangeHours === r.hours
                    ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-56 items-center justify-center text-sm text-[var(--color-text-muted)]">
          Loading trend metrics…
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center text-sm text-[var(--color-text-faint)]">
          <TrendingUp className="mb-2 h-6 w-6 opacity-40" />
          <p>No historical monitoring data for this window yet</p>
        </div>
      ) : (
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.brand} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={CHART_COLORS.brand} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="availGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="label" {...chartAxisProps} />
              <YAxis
                {...chartAxisProps}
                domain={metric === "availability" ? [0, 100] : ["auto", "auto"]}
                tickFormatter={(val) => (metric === "availability" ? `${val}%` : `${val}ms`)}
              />
              <Tooltip {...chartTooltipProps} />
              {metric === "latency" ? (
                <Area
                  type="monotone"
                  dataKey="avg_response_time"
                  name="Avg Response Time (ms)"
                  stroke={CHART_COLORS.brand}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#latencyGradient)"
                />
              ) : (
                <Area
                  type="monotone"
                  dataKey="availability"
                  name="Availability (%)"
                  stroke={CHART_COLORS.success}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#availGradient)"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function useAutoRefreshCountdown(intervalSeconds = 15, dataUpdatedAt?: number) {
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds);

  useEffect(() => {
    setSecondsLeft(intervalSeconds);
  }, [dataUpdatedAt, intervalSeconds]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? intervalSeconds : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [intervalSeconds]);

  return secondsLeft;
}

export function Dashboard() {
  const { data: summary, isLoading, dataUpdatedAt, isFetching } = useDashboardSummary();
  const runAll = useRunAllChecks();
  const countdown = useAutoRefreshCountdown(15, dataUpdatedAt);

  const pieData = summary
    ? [
        { name: "Healthy", value: summary.healthy_endpoints },
        { name: "Warning", value: summary.warning_endpoints },
        { name: "Down", value: summary.failed_endpoints },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Dashboard</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Real-time overview of monitored endpoints.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>{isFetching ? "Syncing…" : `Live • auto-refresh in ${countdown}s`}</span>
          </div>
          <Button onClick={() => runAll.mutate()} disabled={runAll.isPending}>
            <RefreshCw className={`h-4 w-4 ${runAll.isPending ? "animate-spin" : ""}`} strokeWidth={2.5} />
            {runAll.isPending ? "Running checks…" : "Run all checks now"}
          </Button>
        </div>
      </div>

      {isLoading || !summary ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading dashboard…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Total Endpoints" value={summary.total_endpoints} icon={Globe} tone="brand" />
            <SummaryCard
              label="Healthy Endpoints"
              value={summary.healthy_endpoints}
              icon={CheckCircle2}
              tone="success"
            />
            <SummaryCard
              label="Failed Endpoints"
              value={summary.failed_endpoints}
              icon={AlertTriangle}
              tone="failure"
            />
            <SummaryCard
              label="Avg Response Time"
              value={`${summary.avg_response_time} ms`}
              icon={Gauge}
              tone="accent"
            />
          </div>

          {/* Quick Actions Shortcuts */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <Sparkles className="h-4 w-4 text-brand-400" />
              <span className="font-medium text-[var(--color-text)]">Quick Actions</span>
              <span className="hidden sm:inline text-[var(--color-text-faint)]">— Fast setup &amp; reporting shortcuts</span>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/endpoints/new">
                <Button variant="secondary" className="h-8 px-3 text-xs">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Add Endpoint
                </Button>
              </Link>
              <Link to="/import">
                <Button variant="secondary" className="h-8 px-3 text-xs">
                  <UploadCloud className="h-3.5 w-3.5" strokeWidth={2} />
                  Import OpenAPI
                </Button>
              </Link>
              <Link to="/reports">
                <Button variant="secondary" className="h-8 px-3 text-xs">
                  <FileCode2 className="h-3.5 w-3.5" strokeWidth={2} />
                  SLA Reports
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ChartContainer title="Health Distribution">
              {pieData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-faint)]">
                  No data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} strokeWidth={0}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS]} />
                      ))}
                    </Pie>
                    <Tooltip {...chartTooltipProps} />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: "var(--color-text-muted)" }}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartContainer>

            <EndpointHealthList className="lg:col-span-2" />
          </div>

          {/* System Performance Trends */}
          <PerformanceTrendsSection />

          {/* Recent Failures */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Recent Failures</h3>
              <Link to="/endpoints" className="text-xs font-medium text-brand-400 hover:text-brand-300 hover:underline">
                View all endpoints
              </Link>
            </div>
            {summary.recent_failures.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-text-faint)]">No recent failures 🎉</p>
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th>Endpoint</Th>
                    <Th>Time</Th>
                    <Th>Status</Th>
                    <Th>Error</Th>
                    <Th>Likely Cause</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {summary.recent_failures.map((failure) => (
                    <tr key={failure.id} className="transition-colors hover:bg-[var(--color-surface-hover)]">
                      <Td>
                        <Link
                          to={`/endpoints/${failure.endpoint_id}`}
                          className="font-medium text-[var(--color-text)] hover:text-brand-300 hover:underline"
                        >
                          {failure.endpoint_name}
                        </Link>
                      </Td>
                      <Td>{new Date(failure.created_at).toLocaleString()}</Td>
                      <Td>{failure.status_code ?? "—"}</Td>
                      <Td className="max-w-md truncate">{failure.error_message ?? "—"}</Td>
                      <Td>
                        {failure.likely_cause ? (
                          <span title={failure.likely_cause.label}>
                            <Badge tone={ROOT_CAUSE_TONE[failure.likely_cause.category]}>
                              {ROOT_CAUSE_SHORT_LABEL[failure.likely_cause.category]}
                            </Badge>
                          </span>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
