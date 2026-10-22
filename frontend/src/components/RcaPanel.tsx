import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { incidentsApi } from "../services/api";
import type { Incident, RcaConfidence, RemediationRisk } from "../types";

const CONFIDENCE_STYLE: Record<RcaConfidence, string> = {
  high: "bg-success-500/15 text-success-300 border-success-500/30",
  medium: "bg-warning-500/15 text-warning-300 border-warning-500/30",
  low: "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]",
};

const RISK_STYLE: Record<RemediationRisk, string> = {
  low: "text-success-300 border-success-500/30",
  medium: "text-warning-300 border-warning-500/30",
  high: "text-failure-300 border-failure-500/30",
};

export function RcaPanel({ incident }: { incident: Incident }) {
  const queryClient = useQueryClient();
  const rca = incident.rca;

  const rerun = useMutation({
    mutationFn: () => incidentsApi.runRca(incident.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incident-detail", incident.id] });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
          Root Cause Analysis
        </span>
        <button
          onClick={() => rerun.mutate()}
          disabled={rerun.isPending}
          className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${rerun.isPending ? "animate-spin" : ""}`} />
          {rca ? "Re-analyze" : "Analyze"}
        </button>
      </div>

      {rerun.isError && (
        <p className="text-[11px] text-failure-300">Analysis failed: {(rerun.error as Error).message}</p>
      )}

      {rca ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${CONFIDENCE_STYLE[rca.diagnosis.confidence]}`}>
              {rca.diagnosis.confidence} confidence
            </span>
            <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
              {rca.diagnosis.category}
            </span>
            <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
              {rca.diagnosis.scope} scope
            </span>
          </div>
          <p className="text-xs text-[var(--color-text)] leading-relaxed">{rca.diagnosis.summary}</p>

          {rca.evidence.length > 0 && (
            <div>
              <span className="text-[10px] text-[var(--color-text-faint)] uppercase block mb-1">Evidence</span>
              <ul className="space-y-1">
                {rca.evidence.map((e) => (
                  <li key={e.signal} className="flex gap-1.5 text-[11px] leading-snug">
                    {e.abnormal ? (
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-warning-400" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-[var(--color-text-faint)]" />
                    )}
                    <span className="text-[var(--color-text-muted)]">
                      <span className="font-semibold text-[var(--color-text)]">{e.signal}:</span> {e.finding}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <span className="text-[10px] text-[var(--color-text-faint)] uppercase block mb-1">Recommended runbook</span>
            <ol className="space-y-1.5">
              {rca.recommendations.map((r) => (
                <li key={r.step} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[11px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-[var(--color-text)]">
                      {r.step}. {r.title}
                    </span>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${RISK_STYLE[r.risk]}`}>
                      {r.risk} risk
                    </span>
                  </div>
                  <p className="mt-0.5 text-[var(--color-text-muted)]">{r.rationale}</p>
                  {r.requires === "kubernetes" && (
                    <p className="mt-0.5 text-[10px] text-[var(--color-text-faint)]">Requires a connected Kubernetes/OpenShift cluster.</p>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {rca.signals_unavailable.length > 0 && (
            <p className="text-[10px] text-[var(--color-text-faint)]">
              Not considered: {rca.signals_unavailable.join("; ")}.
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-[var(--color-text)] leading-relaxed">
          {incident.root_cause || "No analysis yet."}
        </p>
      )}

      {incident.affected_pods && incident.affected_pods.length > 0 && (
        <div>
          <span className="text-[10px] text-[var(--color-text-faint)] uppercase block mb-1">Correlated OpenShift Pods:</span>
          <div className="flex flex-wrap gap-1.5">
            {incident.affected_pods.map((pod) => (
              <span
                key={pod}
                className="rounded bg-[var(--color-surface)] px-2 py-0.5 font-mono text-[10px] text-brand-300 border border-[var(--color-border)]"
              >
                {pod}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
