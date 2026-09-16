import type { ReactNode } from "react";
import { Card } from "./Card";

export function ChartContainer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-[var(--color-text)]">{title}</h3>
      <div className="h-64 w-full">{children}</div>
    </Card>
  );
}
