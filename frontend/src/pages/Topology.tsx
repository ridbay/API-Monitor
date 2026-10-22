import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Network,
  Radio,
  RefreshCw,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
} from "lucide-react";
import { topologyApi } from "../services/api";
import { TopologyGraph } from "../components/TopologyGraph";
import { TracerouteModal } from "../components/TracerouteModal";

export function Topology() {
  const [filterStatus, setFilterStatus] = useState<"all" | "up" | "degraded" | "down">("all");
  const [customTracerouteUrl, setCustomTracerouteUrl] = useState("");
  const [isTracerouteOpen, setIsTracerouteOpen] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["topology"],
    queryFn: topologyApi.get,
    refetchInterval: 15000,
  });

  const summary = data?.summary;

  const handleLaunchCustomTrace = (e: FormEvent) => {
    e.preventDefault();
    if (customTracerouteUrl.trim()) {
      setIsTracerouteOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-lg shadow-brand-500/20">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
                Service Dependency Topology
              </h1>
              <p className="text-xs text-[var(--color-text-muted)]">
                Real-time microservices graph, pod clusters, ingress routing & blast-radius analysis
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <form onSubmit={handleLaunchCustomTrace} className="flex items-center gap-2">
            <div className="relative">
              <Radio className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-faint)]" />
              <input
                type="text"
                placeholder="Trace URL (e.g. https://...)"
                value={customTracerouteUrl}
                onChange={(e) => setCustomTracerouteUrl(e.target.value)}
                className="h-9 w-60 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-8 pr-3 text-xs text-[var(--color-text)] placeholder-[var(--color-text-faint)] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <button
              type="submit"
              disabled={!customTracerouteUrl.trim()}
              className="h-9 rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 text-xs font-semibold text-brand-300 hover:bg-brand-500/20 disabled:opacity-50 transition-colors"
            >
              Trace Hop
            </button>
          </form>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="text-[11px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wider">
            Total Graph Nodes
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[var(--color-text)]">
              {summary?.totalNodes ?? "—"}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {summary?.totalEdges ?? 0} links
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">OpenShift cluster nodes</p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="text-[11px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wider">
            Healthy Services
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-success-400">
              {summary?.healthyNodes ?? "—"}
            </span>
            <CheckCircle2 className="h-4 w-4 text-success-400" />
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Operating within SLA</p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="text-[11px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wider">
            Degraded Nodes
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-warning-400">
              {summary?.degradedNodes ?? "—"}
            </span>
            <AlertTriangle className="h-4 w-4 text-warning-400" />
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Elevated response latency</p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="text-[11px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wider">
            Critical Outages
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${summary?.downNodes ? "text-failure-400" : "text-[var(--color-text-muted)]"}`}>
              {summary?.downNodes ?? "0"}
            </span>
            {summary?.downNodes ? (
              <XCircle className="h-4 w-4 text-failure-400 animate-pulse" />
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Unreachable / 5xx errors</p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="text-[11px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wider">
            Critical Path Latency
          </span>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-brand-300">
              {summary?.criticalPathLatencyMs ?? "—"}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">ms</span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">End-to-end max hop</p>
        </div>
      </div>

      {/* Filter and State Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--color-text-faint)] mr-2 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" />
            Filter State:
          </span>
          {(["all", "up", "degraded", "down"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                filterStatus === status
                  ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              }`}
            >
              {status === "all" ? "All Services" : status.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--color-text-faint)]">
          <span className="flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-accent-400" />
            Drag nodes to rearrange architecture view
          </span>
        </div>
      </div>

      {/* Graph Visualizer Container */}
      {isLoading ? (
        <div className="flex h-[600px] items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex flex-col items-center gap-2 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-brand-400" />
            <p className="text-sm font-medium text-[var(--color-text)]">Constructing service topology graph...</p>
            <p className="text-xs text-[var(--color-text-muted)]">Aggregating telemetry from OpenShift pods and synthetic monitors</p>
          </div>
        </div>
      ) : isError ? (
        <div className="flex h-[400px] items-center justify-center rounded-2xl border border-failure-500/30 bg-failure-500/10 p-6 text-center">
          <p className="text-sm font-medium text-failure-300">Failed to load topology graph</p>
        </div>
      ) : data ? (
        <TopologyGraph
          data={data}
          filterStatus={filterStatus}
        />
      ) : null}

      {/* Custom Traceroute Modal */}
      {isTracerouteOpen && customTracerouteUrl && (
        <TracerouteModal
          targetUrl={customTracerouteUrl}
          isOpen={isTracerouteOpen}
          onClose={() => setIsTracerouteOpen(false)}
        />
      )}
    </div>
  );
}
