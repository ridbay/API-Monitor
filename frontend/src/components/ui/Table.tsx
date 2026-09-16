import type { ReactNode } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
      <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="bg-[var(--color-surface-2)]">{children}</thead>;
}

export function Th({ children }: { children?: ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
      {children}
    </th>
  );
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">{children}</tbody>;
}

export function Td({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`px-4 py-3 text-[var(--color-text-muted)] ${className}`} title={title}>
      {children}
    </td>
  );
}
