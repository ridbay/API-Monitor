import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { remediationApi } from "../services/api";
import { errorMessage, useOperatorName } from "../lib/operator";

const ACTION_LABELS: Record<string, string> = {
  reprobe: "Re-probe endpoint",
  run_traceroute: "Network path diagnostic",
  reduce_check_frequency: "Reduce check frequency",
  update_endpoint_timeout: "Raise check timeout",
  rollout_restart: "Rollout-restart deployment",
  scale_deployment: "Scale deployment",
};

export function AutopilotSettings() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [operator, setOperator] = useOperatorName();
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["autopilot"], queryFn: remediationApi.getAutopilot, enabled: open });
  const activeCount = data?.policies.filter((p) => p.enabled).length ?? 0;

  const toggle = useMutation({
    mutationFn: ({ action, enabled }: { action: string; enabled: boolean }) =>
      remediationApi.setAutopilot(action, enabled, operator.trim()),
    onMutate: () => setError(null),
    onSuccess: (settings) => queryClient.setQueryData(["autopilot"], settings),
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
      >
        <Bot className="h-3.5 w-3.5" />
        Autopilot{data ? ` (${activeCount})` : ""}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl space-y-3">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text)]">Autopilot policies</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Enabled actions run as soon as they're proposed, without approval. Only low-risk actions are eligible.
            </p>
          </div>

          <label className="block text-[10px] text-[var(--color-text-faint)]">
            Changing as
            <input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="your name"
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]"
            />
          </label>

          {error && <p className="text-[11px] text-failure-300">{error}</p>}

          <ul className="space-y-1.5">
            {data?.policies.map((p) => (
              <li key={p.action} className="flex items-center justify-between gap-2 text-[11px]">
                <span className={p.eligible ? "text-[var(--color-text)]" : "text-[var(--color-text-faint)]"}>
                  {ACTION_LABELS[p.action] ?? p.action}
                  {!p.eligible && <span className="ml-1 text-[10px]">(needs approval)</span>}
                </span>
                <input
                  type="checkbox"
                  checked={p.enabled}
                  disabled={!p.eligible || toggle.isPending || operator.trim().length < 2}
                  onChange={(e) => toggle.mutate({ action: p.action, enabled: e.target.checked })}
                  aria-label={`Autopilot for ${ACTION_LABELS[p.action] ?? p.action}`}
                  className="h-3.5 w-3.5 accent-brand-500 disabled:opacity-40"
                />
              </li>
            ))}
          </ul>

          {data && (
            <p className="border-t border-[var(--color-border)] pt-2 text-[10px] text-[var(--color-text-faint)]">
              Kubernetes actions:{" "}
              {data.kubernetes.enabled ? `connected (${data.kubernetes.source})` : data.kubernetes.reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
