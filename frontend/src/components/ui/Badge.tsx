type BadgeTone = "success" | "warning" | "failure" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-[var(--color-success-bg)] text-success-400 ring-1 ring-inset ring-success-500/20",
  warning: "bg-[var(--color-warning-bg)] text-warning-400 ring-1 ring-inset ring-warning-500/20",
  failure: "bg-[var(--color-failure-bg)] text-failure-400 ring-1 ring-inset ring-failure-500/20",
  neutral: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] ring-1 ring-inset ring-[var(--color-border-strong)]",
};

const DOT_ANIMATE: Partial<Record<BadgeTone, boolean>> = { success: true, failure: true };

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      <span className="relative flex h-1.5 w-1.5">
        {DOT_ANIMATE[tone] && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {children}
    </span>
  );
}
