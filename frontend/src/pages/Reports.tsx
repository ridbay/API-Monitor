import { Card } from "../components/ui/Card";
import { Table, Tbody, Td, Th, Thead } from "../components/ui/Table";
import { useDailyReport, useWeeklyReport } from "../hooks/useDashboard";

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <p className="text-xs font-medium text-[var(--color-text-faint)]">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-[var(--color-text)]">{value}</p>
    </div>
  );
}

function RankedList({
  title,
  items,
  valueKey,
  valueSuffix = "",
}: {
  title: string;
  items: Array<{ endpoint_id: number; name: string } & Record<string, unknown>>;
  valueKey: string;
  valueSuffix?: string;
}) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-faint)]">No data yet</p>
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Endpoint</Th>
              <Th>Value</Th>
            </tr>
          </Thead>
          <Tbody>
            {items.map((item) => (
              <tr key={item.endpoint_id} className="transition-colors hover:bg-[var(--color-surface-hover)]">
                <Td className="font-medium text-[var(--color-text)]">{item.name}</Td>
                <Td>
                  {String(item[valueKey])}
                  {valueSuffix}
                </Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Card>
  );
}

export function Reports() {
  const { data: daily, isLoading: dailyLoading } = useDailyReport();
  const { data: weekly, isLoading: weeklyLoading } = useWeeklyReport();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Reports</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Daily and weekly monitoring summaries.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
          Daily Report — {daily?.date}
        </h2>
        {dailyLoading || !daily ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Availability" value={`${daily.availability}%`} />
            <StatTile label="Average Response" value={`${daily.avg_response_time} ms`} />
            <StatTile label="Total Checks" value={daily.total_checks} />
            <StatTile label="Failures" value={daily.failures} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">Weekly Report</h2>
        {weeklyLoading || !weekly ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <RankedList title="Top Fast APIs" items={weekly.top_fast_apis} valueKey="avg_response_time" valueSuffix=" ms" />
            <RankedList title="Most Unstable APIs" items={weekly.most_unstable_apis} valueKey="success_rate" valueSuffix="%" />
            <RankedList title="Best Availability" items={weekly.best_availability} valueKey="availability" valueSuffix="%" />
          </div>
        )}
      </section>
    </div>
  );
}
