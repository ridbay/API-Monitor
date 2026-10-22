import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Bot } from "lucide-react";
import { remediationApi } from "../services/api";
import { errorMessage, useOperatorName } from "../lib/operator";
import type { Incident, RemediationPlan, RemediationPlanStatus, RemediationRisk } from "../types";

const RISK_STYLE: Record<RemediationRisk, string> = {
  low: "text-success-300 border-success-500/30",
  medium: "text-warning-300 border-warning-500/30",
  high: "text-failure-300 border-failure-500/30",
};

const STATUS_STYLE: Record<RemediationPlanStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  EXECUTING: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  SUCCEEDED: "bg-success-500/10 text-success-300 border-success-500/20",
  COMPLETED: "bg-success-500/10 text-success-300 border-success-500/20",
  FAILED: "bg-failure-500/10 text-failure-300 border-failure-500/20",
  REJECTED: "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]",
  SUPERSEDED: "bg-[var(--color-surface)] text-[var(--color-text-faint)] border-[var(--color-border)]",
};

export function RemediationPanel({ incident }: { incident: Incident }) {
  const queryClient = useQueryClient();
  const [operator, setOperator] = useOperatorName();
  const [error, setError] = useState<string | null>(null);
  const plans = incident.remediation_plans ?? [];
  const current = plans.filter((p) => p.status !== "SUPERSEDED").sort((a, b) => a.step - b.step || a.id - b.id);
  const supersededCount = plans.length - current.length;
  const hasPending = current.some((p) => p.status === "PENDING");

  const decide = useMutation({
    mutationFn: ({ plan, decision }: { plan: RemediationPlan; decision: "approve" | "reject" }) =>
      decision === "approve"
        ? remediationApi.approve(plan.reference, operator.trim())
        : remediationApi.reject(plan.reference, operator.trim()),
    onMutate: () => setError(null),
    onError: (err) => setError(errorMessage(err)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["incident-detail", incident.id] });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  if (!plans.length) return null;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 space-y-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)] block">
        Remediation Plan
      </span>

      {hasPending && (
        <label className="block text-[10px] text-[var(--color-text-faint)]">
          Approving as
          <input
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="your name, e.g. alice.sre"
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]"
          />
        </label>
      )}

      {error && <p className="text-[11px] text-failure-300">{error}</p>}

      <ol className="space-y-2">
        {current.map((plan) => (
          <li key={plan.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-[11px] space-y-1">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-[var(--color-text)]">
                <span className="font-mono text-[10px] text-brand-300">{plan.reference}</span> {plan.title}
              </span>
              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${RISK_STYLE[plan.risk]}`}>
                {plan.risk}
              </span>
            </div>
            {plan.rationale && <p className="text-[var(--color-text-muted)]">{plan.rationale}</p>}

            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLE[plan.status]}`}>{plan.status}</span>
              {plan.auto_executed && (
                <span className="flex items-center gap-0.5 text-[10px] text-sky-300">
                  <Bot className="h-3 w-3" /> autopilot
                </span>
              )}
              {plan.verification && (
                <span className={`text-[10px] ${plan.verification === "recovered" ? "text-success-300" : "text-failure-300"}`}>
                  {plan.verification === "recovered" ? "verified: endpoint up" : "verified: still failing"}
                </span>
              )}
              {plan.decided_by && plan.status !== "PENDING" && (
                <span className="text-[10px] text-[var(--color-text-faint)]">by {plan.decided_by}</span>
              )}
            </div>

            {plan.status === "FAILED" && plan.result?.error != null && (
              <p className="text-[10px] text-failure-300">{String(plan.result.error)}</p>
            )}
            {plan.requires === "kubernetes" && plan.status === "PENDING" && (
              <p className="text-[10px] text-[var(--color-text-faint)]">Runs against the Kubernetes/OpenShift API.</p>
            )}

            {plan.status === "PENDING" && (
              <div className="flex gap-1.5 pt-0.5">
                <button
                  onClick={() => decide.mutate({ plan, decision: "approve" })}
                  disabled={decide.isPending || operator.trim().length < 2}
                  className="flex items-center gap-1 rounded-md border border-success-500/30 bg-success-500/15 px-2 py-1 text-[10px] font-semibold text-success-300 hover:bg-success-500/25 disabled:opacity-40 transition-colors"
                >
                  <Check className="h-3 w-3" />
                  {plan.action === "manual" ? "Mark done" : "Approve & run"}
                </button>
                <button
                  onClick={() => decide.mutate({ plan, decision: "reject" })}
                  disabled={decide.isPending || operator.trim().length < 2}
                  className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
                >
                  <X className="h-3 w-3" />
                  {plan.action === "manual" ? "Skip" : "Reject"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {supersededCount > 0 && (
        <p className="text-[10px] text-[var(--color-text-faint)]">
          {supersededCount} earlier step(s) superseded by a newer analysis.
        </p>
      )}
    </div>
  );
}
