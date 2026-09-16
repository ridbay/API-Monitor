import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Gauge, Globe, RefreshCw } from "lucide-react";
import { Card } from "../components/ui/Card";
import { ChartContainer } from "../components/ui/ChartContainer";
import { Table, Tbody, Td, Th, Thead } from "../components/ui/Table";
import { Button } from "../components/ui/Button";
import { useDashboardSummary } from "../hooks/useDashboard";
import { useRunAllChecks } from "../hooks/useEndpoints";
import { chartTooltipProps, CHART_COLORS } from "../lib/chartTheme";

const COLORS = { Healthy: CHART_COLORS.success, Warning: CHART_COLORS.warning, Down: CHART_COLORS.failure };

type Tone = "brand" | "success" | "failure" | "accent";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-500/10 text-brand-300",
  success: "bg-success-500/10 text-success-400",
  failure: "bg-failure-500/10 text-failure-400",
  accent: "bg-accent-500/10 text-accent-400",
};

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Globe;
  tone: Tone;
}) {
  return (
    <Card className="flex items-start justify-between">
      <div>
        <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
        <p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--color-text)]">{value}</p>
      </div>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>
        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { data: summary, isLoading } = useDashboardSummary();
  const runAll = useRunAllChecks();

  const pieData = summary
    ? [
        { name: "Healthy", value: summary.healthy_endpoints },
        { name: "Warning", value: summary.warning_endpoints },
        { name: "Down", value: summary.failed_endpoints },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Dashboard</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Real-time overview of monitored endpoints.</p>
        </div>
        <Button onClick={() => runAll.mutate()} disabled={runAll.isPending}>
          <RefreshCw className={`h-4 w-4 ${runAll.isPending ? "animate-spin" : ""}`} strokeWidth={2.5} />
          {runAll.isPending ? "Running checks…" : "Run all checks now"}
        </Button>
      </div>

      {isLoading || !summary ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading dashboard…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Total Endpoints" value={summary.total_endpoints} icon={Globe} tone="brand" />
            <SummaryCard
              label="Healthy Endpoints"
              value={summary.healthy_endpoints}
              icon={CheckCircle2}
              tone="success"
            />
            <SummaryCard
              label="Failed Endpoints"
              value={summary.failed_endpoints}
              icon={AlertTriangle}
              tone="failure"
            />
            <SummaryCard
              label="Avg Response Time"
              value={`${summary.avg_response_time} ms`}
              icon={Gauge}
              tone="accent"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ChartContainer title="Health Distribution">
              {pieData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-faint)]">
                  No data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} strokeWidth={0}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS]} />
                      ))}
                    </Pie>
                    <Tooltip {...chartTooltipProps} />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: "var(--color-text-muted)" }}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartContainer>

            <Card className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Recent Failures</h3>
                <Link to="/endpoints" className="text-xs font-medium text-brand-400 hover:text-brand-300 hover:underline">
                  View all endpoints
                </Link>
              </div>
              {summary.recent_failures.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-text-faint)]">No recent failures 🎉</p>
              ) : (
                <Table>
                  <Thead>
                    <tr>
                      <Th>Endpoint</Th>
                      <Th>Time</Th>
                      <Th>Status</Th>
                      <Th>Error</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {summary.recent_failures.map((failure) => (
                      <tr key={failure.id} className="transition-colors hover:bg-[var(--color-surface-hover)]">
                        <Td>
                          <Link
                            to={`/endpoints/${failure.endpoint_id}`}
                            className="font-medium text-[var(--color-text)] hover:text-brand-300 hover:underline"
                          >
                            {failure.endpoint_name}
                          </Link>
                        </Td>
                        <Td>{new Date(failure.created_at).toLocaleString()}</Td>
                        <Td>{failure.status_code ?? "—"}</Td>
                        <Td className="max-w-xs truncate">{failure.error_message ?? "—"}</Td>
                      </tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
