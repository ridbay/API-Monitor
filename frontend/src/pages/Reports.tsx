import { Link } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Table, Tbody, Td, Th, Thead } from "../components/ui/Table";
import { useDailyReport, useMonthlyReport, useWeeklyReport } from "../hooks/useDashboard";

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
  emptyMessage = "No data yet",
}: {
  title: string;
  items: Array<{ endpoint_id: number; name: string } & Record<string, unknown>>;
  valueKey: string;
  valueSuffix?: string;
  emptyMessage?: string;
}) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-faint)]">{emptyMessage}</p>
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
  const { data: monthly, isLoading: monthlyLoading } = useMonthlyReport();

  const unstableApis = (weekly?.most_unstable_apis ?? []).filter(
    (item) => Number(item.success_rate) < 100
  );
  const bestAvailabilityApis = (weekly?.best_availability ?? []).filter(
    (item) => Number(item.availability) > 80
  );

  const uptimeRanking =
    monthly?.uptime_ranking && monthly.uptime_ranking.length > 0
      ? monthly.uptime_ranking
      : weekly?.best_availability && weekly.best_availability.length > 0
        ? weekly.best_availability.map((i) => ({
            endpoint_id: i.endpoint_id,
            name: i.name,
            uptime: i.availability,
          }))
        : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Reports</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Daily, weekly, and monthly monitoring summaries.</p>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <RankedList title="Top Fast APIs" items={weekly.top_fast_apis} valueKey="avg_response_time" valueSuffix=" ms" />
            <RankedList
              title="Top Slowest APIs"
              items={weekly.top_slow_apis ?? weekly.top_slowest_apis ?? []}
              valueKey="avg_response_time"
              valueSuffix=" ms"
            />
            <RankedList
              title="Most Unstable APIs"
              items={unstableApis}
              valueKey="success_rate"
              valueSuffix="%"
              emptyMessage={weekly.top_fast_apis.length > 0 ? "No unstable APIs" : "No data yet"}
            />
            <RankedList
              title="Best Availability"
              items={bestAvailabilityApis}
              valueKey="availability"
              valueSuffix="%"
              emptyMessage={weekly.top_fast_apis.length > 0 ? "No APIs above 80%" : "No data yet"}
            />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">30-Day Report</h2>
        {monthlyLoading && !monthly ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Services tracked" value={monthly?.services_tracked ?? 0} />
              <StatTile label="Avg uptime (30d)" value={`${monthly?.avg_uptime ?? 0}%`} />
              <StatTile label="Incidents (30d)" value={monthly?.incidents ?? 0} />
              <StatTile label="Currently degraded" value={monthly?.currently_degraded ?? 0} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <RankedList
                title="Uptime Ranking"
                items={uptimeRanking}
                valueKey="uptime"
                valueSuffix="%"
                emptyMessage="No uptime data yet"
              />
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <Card>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Outages today</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              All detected incidents and outages across monitored services.
            </p>
          </div>

          {!daily?.outages || daily.outages.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-faint)]">
              No outages detected today 🎉
            </p>
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Service</Th>
                  <Th>Time</Th>
                  <Th>Status</Th>
                  <Th>Error</Th>
                </tr>
              </Thead>
              <Tbody>
                {daily.outages.map((outage) => (
                  <tr key={outage.id} className="transition-colors hover:bg-[var(--color-surface-hover)]">
                    <Td>
                      <Link
                        to={`/endpoints/${outage.endpoint_id}`}
                        className="font-medium text-[var(--color-text)] hover:text-brand-300 hover:underline"
                      >
                        {outage.endpoint_name}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-[var(--color-text-muted)]">
                      {new Date(outage.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Td>
                    <Td>
                      <Badge tone="failure">{outage.status_code ?? "Down"}</Badge>
                    </Td>
                    <Td className="max-w-md truncate text-xs text-[var(--color-text-muted)]" title={outage.error_message ?? ""}>
                      {outage.error_message || "Check failed"}
                    </Td>
                  </tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      </section>
    </div>
  );
}
