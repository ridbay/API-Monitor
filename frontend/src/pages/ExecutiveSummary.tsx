import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Printer,
  RefreshCw,
  Award,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { executiveApi } from "../services/api";

export function ExecutiveSummary() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["executive-summary"],
    queryFn: executiveApi.getSummary,
    refetchInterval: 30000,
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-brand-400" />
          <p className="text-sm font-medium text-[var(--color-text)]">Generating executive telemetry briefing...</p>
          <p className="text-xs text-[var(--color-text-muted)]">Aggregating 30-day fleet SLAs and incident metrics</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-failure-500/30 bg-failure-500/10 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-failure-400 mb-2" />
        <p className="text-sm font-medium text-failure-300">Unable to load executive summary data</p>
      </div>
    );
  }

  const isMeetingSla = data.fleetAvailabilityPct >= data.slaCommitmentPct;

  return (
    <div className="space-y-6 print:p-0 print:space-y-4">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-border)] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-lg shadow-brand-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
                  Executive Operations & SLA Summary
                </h1>
                <span className="rounded-full bg-success-500/10 px-2 py-0.5 text-[10px] font-semibold text-success-400 border border-success-500/20">
                  C-Level Briefing
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                Enterprise service level commitments, MTTD/MTTR operational performance, and line-of-business health
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 print:hidden">
          <button
            onClick={handlePrint}
            className="flex h-9 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors shadow-sm"
          >
            <Printer className="h-4 w-4 text-[var(--color-text-muted)]" />
            Print / Export PDF
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Sync
          </button>
        </div>
      </div>

      {/* Leadership KPI Scorecards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Fleet Availability Gauge */}
        <div className="rounded-2xl border border-[var(--color-border-strong)] bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-2)] p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
              Fleet SLA Compliance
            </span>
            <Award className="h-4 w-4 text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold font-mono tracking-tight ${
                isMeetingSla ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {data.fleetAvailabilityPct}%
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              vs {data.slaCommitmentPct}% SLA
            </span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span
              className={`inline-flex items-center gap-1 font-semibold ${
                isMeetingSla ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isMeetingSla ? "SLA Target Exceeded" : "Risk of Breach"}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-emerald-400"
              style={{ width: `${Math.min(100, (data.fleetAvailabilityPct / 100) * 100)}%` }}
            />
          </div>
        </div>

        {/* MTTD */}
        <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
              Mean Time to Detect (MTTD)
            </span>
            <Clock className="h-4 w-4 text-accent-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold font-mono text-accent-300">
              {data.mttdSeconds}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">seconds</span>
          </div>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Continuous synthetic polling catches faults <strong className="text-[var(--color-text)]">92% faster</strong> than manual tickets.
          </p>
        </div>

        {/* MTTR */}
        <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
              Mean Time to Resolve (MTTR)
            </span>
            <Zap className="h-4 w-4 text-warning-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold font-mono text-warning-400">
              {data.mttrMinutes}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">minutes</span>
          </div>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Guided RCA & instant mitigation paths minimized downtime impact.
          </p>
        </div>

        {/* Downtime Avoided & Risk */}
        <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
              Downtime Prevented
            </span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold font-mono text-emerald-400">
              {data.outageMinutesAvoided}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">mins avoided</span>
          </div>
          <p className="mt-3 text-xs text-success-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Financial breach risk: {data.slaBreachRisk.toUpperCase()}
          </p>
        </div>
      </div>

      {/* 30-Day SLA & Latency Compliance Trend Chart */}
      <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              30-Day Historical SLA Compliance & Latency Trend
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Fleet uptime evaluated against target 99.90% SLA commitment line
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-[var(--color-text-muted)]">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />
              <span>Availability (%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-emerald-400" />
              <span>99.9% Target SLA</span>
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.trend30Days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="availGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#212739" vertical={false} />
              <XAxis dataKey="date" stroke="#5c6478" fontSize={11} tickLine={false} />
              <YAxis
                domain={[98, 100]}
                stroke="#5c6478"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#10141f",
                  borderColor: "#2d3548",
                  borderRadius: "12px",
                  fontSize: "12px",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                }}
              />
              <ReferenceLine y={99.9} stroke="#10b981" strokeDasharray="4 4" label={{ value: "99.9% SLA", fill: "#10b981", fontSize: 10, position: "top" }} />
              <Area
                type="monotone"
                dataKey="availability"
                stroke="#818cf8"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#availGradient)"
                name="Fleet Availability"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Line of Business / Core Domain Health */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text)]">
            Core Line-of-Business & Domain Performance
          </h2>
          <span className="text-xs text-[var(--color-text-muted)]">
            4 critical business capabilities monitored
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.businessDomains.map((domain) => (
            <div
              key={domain.name}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4.5 hover:border-brand-500/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--color-text)] truncate">{domain.name}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    domain.status === "healthy"
                      ? "bg-success-500/10 text-success-400 border border-success-500/20"
                      : "bg-warning-500/10 text-warning-400 border border-warning-500/20"
                  }`}
                >
                  {domain.status.toUpperCase()}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-[var(--color-text-faint)] uppercase">Availability</span>
                  <p className="font-mono font-bold text-[var(--color-text)] text-sm">{domain.availabilityPct}%</p>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--color-text-faint)] uppercase">Avg Latency</span>
                  <p className="font-mono font-bold text-[var(--color-text)] text-sm">{domain.avgLatencyMs}ms</p>
                </div>
              </div>

              <div className="mt-3 border-t border-[var(--color-border)] pt-2 flex items-center justify-between text-[11px] text-[var(--color-text-faint)]">
                <span>Commitment: {domain.slaCommitmentPct}%</span>
                <span>{domain.activeIncidents} active tickets</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Critical Outages & Resolved Incidents */}
      <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              Critical Incidents & Postmortem Rollup
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Tracked incidents with unique references, detected root causes, and resolution metrics
            </p>
          </div>
          <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-mono font-semibold text-brand-300 border border-brand-500/20">
            {data.recentCriticalIncidents.length} Logged Incidents
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">
                <th className="pb-3 font-semibold">Incident Ref</th>
                <th className="pb-3 font-semibold">Service Impacted</th>
                <th className="pb-3 font-semibold">Severity</th>
                <th className="pb-3 font-semibold">Downtime Duration</th>
                <th className="pb-3 font-semibold">Root Cause Classification</th>
                <th className="pb-3 font-semibold">Lifecycle Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.recentCriticalIncidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                  <td className="py-3.5 font-mono font-bold text-brand-400">{inc.id}</td>
                  <td className="py-3.5">
                    <span className="font-semibold text-[var(--color-text)] block">{inc.serviceName}</span>
                    <span className="text-[10px] text-[var(--color-text-faint)] font-mono truncate max-w-xs block">
                      {inc.endpointUrl}
                    </span>
                  </td>
                  <td className="py-3.5">
                    <span className="rounded bg-failure-500/10 px-2 py-0.5 text-[10px] font-bold text-failure-400 border border-failure-500/20">
                      {inc.severity}
                    </span>
                  </td>
                  <td className="py-3.5 font-mono text-[var(--color-text)]">{inc.durationMinutes} mins</td>
                  <td className="py-3.5 text-[var(--color-text-muted)] max-w-sm truncate">{inc.rootCause}</td>
                  <td className="py-3.5">
                    <span className="inline-flex items-center gap-1 rounded bg-success-500/10 px-2 py-0.5 text-[10px] font-bold text-success-400 border border-success-500/20">
                      <CheckCircle2 className="h-3 w-3" />
                      {inc.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
