import { useQuery } from "@tanstack/react-query";
import {
  X,
  Radio,
  Server,
  Shield,
  Globe,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  Layers,
} from "lucide-react";
import { tracerouteApi } from "../services/api";
import type { TracerouteHop } from "../types";

interface TracerouteModalProps {
  endpointId?: number;
  targetUrl?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TracerouteModal({ endpointId, targetUrl, isOpen, onClose }: TracerouteModalProps) {
  const query = useQuery({
    queryKey: ["traceroute", endpointId ?? targetUrl],
    queryFn: () => {
      if (endpointId) {
        return tracerouteApi.getByEndpointId(endpointId);
      }
      return tracerouteApi.run(targetUrl || "");
    },
    enabled: isOpen && Boolean(endpointId || targetUrl),
    staleTime: 1000 * 30,
  });

  if (!isOpen) return null;

  const data = query.data;

  const getHopIcon = (type: TracerouteHop["nodeType"]) => {
    switch (type) {
      case "gateway":
        return <Radio className="h-4 w-4 text-brand-400" />;
      case "proxy":
        return <Shield className="h-4 w-4 text-accent-400" />;
      case "router":
        return <Layers className="h-4 w-4 text-sky-400" />;
      case "isp":
        return <Globe className="h-4 w-4 text-emerald-400" />;
      case "cdn":
        return <Globe className="h-4 w-4 text-amber-400" />;
      case "target":
        return <Server className="h-4 w-4 text-indigo-400" />;
      default:
        return <Cpu className="h-4 w-4 text-[var(--color-text-muted)]" />;
    }
  };

  const getStatusBadge = (status: TracerouteHop["status"], rttMs: number) => {
    if (status === "unreachable" || status === "timeout") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-failure-500/10 px-2 py-0.5 text-[11px] font-semibold text-failure-400 border border-failure-500/20">
          <XCircle className="h-3 w-3" />
          {status.toUpperCase()}
        </span>
      );
    }
    if (status === "congested" || rttMs > 400) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-warning-500/10 px-2 py-0.5 text-[11px] font-semibold text-warning-400 border border-warning-500/20">
          <AlertTriangle className="h-3 w-3" />
          CONGESTED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-success-500/10 px-2 py-0.5 text-[11px] font-semibold text-success-400 border border-success-500/20">
        <CheckCircle2 className="h-3 w-3" />
        OPTIMAL
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4.5 bg-[var(--color-surface-2)]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <Radio className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--color-text)]">Network Path Traceroute</h2>
                <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-300 border border-brand-500/20">
                  L3/L4 Diagnostics
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] truncate max-w-md">
                {data?.targetUrl ?? targetUrl ?? "Diagnostic probe running..."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              title="Re-run diagnostic probe"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {query.isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-brand-400" />
              <p className="text-sm font-medium text-[var(--color-text)]">Synthesizing network path & socket telemetry...</p>
              <p className="text-xs text-[var(--color-text-muted)]">Testing DNS resolution, Envoy ingress hops, and destination handshake</p>
            </div>
          ) : query.isError ? (
            <div className="rounded-xl border border-failure-500/30 bg-failure-500/10 p-5 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-failure-400 mb-2" />
              <p className="text-sm font-medium text-failure-300">Failed to execute traceroute</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{(query.error as Error).message}</p>
            </div>
          ) : data ? (
            <>
              {/* Telemetry Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5">
                  <span className="text-[11px] font-medium text-[var(--color-text-faint)] uppercase tracking-wider">Target Host</span>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-text)] truncate">{data.targetHost}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] font-mono truncate">{data.resolvedIp}</p>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5">
                  <span className="text-[11px] font-medium text-[var(--color-text-faint)] uppercase tracking-wider">DNS Resolution</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-lg font-bold text-brand-300 font-mono">{data.dnsLookupMs}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">ms</span>
                  </div>
                  <p className="text-[11px] text-success-400">DNS Authoritative OK</p>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5">
                  <span className="text-[11px] font-medium text-[var(--color-text-faint)] uppercase tracking-wider">Total Latency</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className={`text-lg font-bold font-mono ${data.totalLatencyMs > 500 ? "text-warning-400" : "text-emerald-400"}`}>
                      {data.totalLatencyMs}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">ms</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{data.totalHops} active hops</p>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5">
                  <span className="text-[11px] font-medium text-[var(--color-text-faint)] uppercase tracking-wider">Path Health</span>
                  <div className="mt-1.5">{getStatusBadge(data.status === "failed" ? "timeout" : data.status === "degraded" ? "congested" : "success", data.totalLatencyMs)}</div>
                  <p className="text-[10px] text-[var(--color-text-faint)] mt-1">
                    {data.bottleneckHop ? `Bottleneck at Hop ${data.bottleneckHop}` : "No congestion"}
                  </p>
                </div>
              </div>

              {/* Diagnostic Summary Alert */}
              <div
                className={`rounded-xl border p-4 text-xs flex items-start gap-3 ${
                  data.status === "failed"
                    ? "border-failure-500/30 bg-failure-500/10 text-failure-200"
                    : data.status === "degraded"
                    ? "border-warning-500/30 bg-warning-500/10 text-warning-200"
                    : "border-success-500/30 bg-success-500/10 text-success-200"
                }`}
              >
                {data.status === "failed" ? (
                  <XCircle className="h-5 w-5 shrink-0 text-failure-400 mt-0.5" />
                ) : data.status === "degraded" ? (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-warning-400 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success-400 mt-0.5" />
                )}
                <div>
                  <span className="font-semibold block text-sm">Diagnostic Assessment</span>
                  <p className="mt-0.5 leading-relaxed text-[var(--color-text-muted)]">{data.summary}</p>
                </div>
              </div>

              {/* Hop-by-Hop Breakdown Table */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  Hop-by-Hop Network Telemetry
                </h3>

                <div className="space-y-2">
                  {data.hops.map((hop, index) => {
                    const isLast = index === data.hops.length - 1;
                    return (
                      <div
                        key={hop.hopNumber}
                        className={`group relative flex items-center justify-between rounded-xl border p-3.5 transition-all ${
                          hop.status === "timeout" || hop.status === "unreachable"
                            ? "border-failure-500/40 bg-failure-500/5"
                            : "border-[var(--color-border)] bg-[var(--color-surface-2)]/60 hover:border-brand-500/40 hover:bg-[var(--color-surface-2)]"
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-mono font-bold text-[var(--color-text-muted)]">
                            {hop.hopNumber}
                          </div>

                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                            {getHopIcon(hop.nodeType)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[var(--color-text)] truncate">{hop.hostname}</span>
                              {isLast && (
                                <span className="rounded bg-brand-500/20 px-1.5 py-0.2 text-[9px] font-bold text-brand-300 uppercase">
                                  Target
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-faint)] font-mono">
                              <span>{hop.ip}</span>
                              {hop.location && (
                                <>
                                  <span>•</span>
                                  <span className="text-[var(--color-text-muted)]">{hop.location}</span>
                                </>
                              )}
                              {hop.asn && (
                                <>
                                  <span>•</span>
                                  <span className="text-brand-400 font-semibold">{hop.asn}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 pl-3">
                          <div className="text-right">
                            <div className="flex items-baseline justify-end gap-1">
                              <span
                                className={`text-sm font-bold font-mono ${
                                  hop.rttMs > 400 ? "text-warning-400" : hop.status === "timeout" ? "text-failure-400" : "text-[var(--color-text)]"
                                }`}
                              >
                                {hop.status === "timeout" ? "—" : `${hop.rttMs}ms`}
                              </span>
                            </div>
                            <span className="text-[10px] text-[var(--color-text-faint)]">
                              {hop.packetLossPct}% loss
                            </span>
                          </div>

                          {getStatusBadge(hop.status, hop.rttMs)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-6 py-3 flex items-center justify-between text-xs text-[var(--color-text-faint)]">
          <span>Probing node: Openshift Cluster Router [Zone 1]</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-[var(--color-surface)] px-4 py-1.5 text-xs font-medium text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
