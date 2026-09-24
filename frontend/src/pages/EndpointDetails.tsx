import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Pencil, Trash2, Zap } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { ChartContainer } from "../components/ui/ChartContainer";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input, Label } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { StatusBadge } from "../components/StatusBadge";
import {
  useDeleteEndpoint,
  useEndpoint,
  useEndpointStatusCodes,
  useEndpointTrends,
  useRunLoadTest,
  useUpdateEndpoint,
} from "../hooks/useEndpoints";
import { chartAxisProps, chartGridProps, chartTooltipProps, CHART_COLORS } from "../lib/chartTheme";
import type { LoadTestResult } from "../types";

const RANGE_OPTIONS = [
  { label: "24 Hours", hours: 24 },
  { label: "7 Days", hours: 24 * 7 },
  { label: "30 Days", hours: 24 * 30 },
];

function formatTimestamp(ts: string, hours: number) {
  const date = new Date(ts);
  return hours <= 24 ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString();
}

export function EndpointDetails() {
  const { id } = useParams<{ id: string }>();
  const endpointId = Number(id);
  const navigate = useNavigate();

  const [rangeHours, setRangeHours] = useState(24);
  const [editOpen, setEditOpen] = useState(false);

  const { data: endpoint, isLoading } = useEndpoint(endpointId);
  const { data: trends } = useEndpointTrends(endpointId, rangeHours);
  const { data: statusCodes } = useEndpointStatusCodes(endpointId);
  const updateEndpoint = useUpdateEndpoint(endpointId);
  const deleteEndpoint = useDeleteEndpoint();

  if (isLoading || !endpoint) {
    return <p className="text-sm text-[var(--color-text-muted)]">Loading endpoint…</p>;
  }

  const chartData = (trends ?? []).map((point) => ({
    ...point,
    label: formatTimestamp(point.timestamp, rangeHours),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">{endpoint.name}</h1>
            <StatusBadge status={endpoint.status} availability={Number(endpoint.availability)} />
          </div>
          <p className="mt-1 font-mono text-sm text-[var(--color-text-faint)]">
            {endpoint.method} {endpoint.url}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
            Edit
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`Delete "${endpoint.name}"?`)) {
                deleteEndpoint.mutate(endpoint.id);
                navigate("/endpoints");
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">Availability</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--color-text)]">
            {Number(endpoint.availability).toFixed(2)}%
          </p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">Avg Response Time</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--color-text)]">
            {endpoint.avg_response_time} ms
          </p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">Last Checked</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--color-text)]">
            {endpoint.last_checked ? new Date(endpoint.last_checked).toLocaleTimeString() : "Never"}
          </p>
        </Card>
      </div>

      <div className="flex gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.hours}
            onClick={() => setRangeHours(opt.hours)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              rangeHours === opt.hours
                ? "bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_4px_16px_-4px_rgba(99,102,241,0.5)]"
                : "border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartContainer title={`Response Time Trend (${RANGE_OPTIONS.find((o) => o.hours === rangeHours)?.label})`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="label" {...chartAxisProps} />
              <YAxis {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} />
              <Line
                type="monotone"
                dataKey="avg_response_time"
                stroke={CHART_COLORS.brand}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                name="Response time (ms)"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Availability Trend (Success vs Failure)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="label" {...chartAxisProps} />
              <YAxis {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} />
              <Bar dataKey="up_count" stackId="a" fill={CHART_COLORS.success} name="Up" radius={[0, 0, 0, 0]} />
              <Bar dataKey="down_count" stackId="a" fill={CHART_COLORS.failure} name="Down" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      <ChartContainer title="Status Code Distribution">
        {!statusCodes || statusCodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-faint)]">
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusCodes}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="status_code" {...chartAxisProps} />
              <YAxis allowDecimals={false} {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} />
              <Bar dataKey="count" fill={CHART_COLORS.brand} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartContainer>

      <LoadTestPanel endpointId={endpointId} />

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Endpoint">
        <EditEndpointForm
          endpoint={endpoint}
          onCancel={() => setEditOpen(false)}
          onSave={async (input) => {
            await updateEndpoint.mutateAsync(input);
            setEditOpen(false);
          }}
          saving={updateEndpoint.isPending}
        />
      </Modal>
    </div>
  );
}

function EditEndpointForm({
  endpoint,
  onCancel,
  onSave,
  saving,
}: {
  endpoint: { url: string; interval: string; timeout: number; expected_status: number };
  onCancel: () => void;
  onSave: (input: { url: string; interval: "1m" | "5m" | "15m" | "30m" | "1h"; timeout: number; expected_status: number }) => Promise<void>;
  saving: boolean;
}) {
  const [url, setUrl] = useState(endpoint.url);
  const [interval, setIntervalValue] = useState(endpoint.interval);
  const [timeout, setTimeoutValue] = useState(endpoint.timeout);
  const [expectedStatus, setExpectedStatus] = useState(endpoint.expected_status);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          url,
          interval: interval as "1m" | "5m" | "15m" | "30m" | "1h",
          timeout,
          expected_status: expectedStatus,
        });
      }}
    >
      <div>
        <Label htmlFor="edit-url">URL</Label>
        <Input id="edit-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="edit-interval">Interval</Label>
          <Select id="edit-interval" value={interval} onChange={(e) => setIntervalValue(e.target.value)}>
            <option value="1m">1 Minute</option>
            <option value="5m">5 Minutes</option>
            <option value="15m">15 Minutes</option>
            <option value="30m">30 Minutes</option>
            <option value="1h">1 Hour</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="edit-timeout">Timeout (ms)</Label>
          <Input
            id="edit-timeout"
            type="number"
            required
            value={timeout}
            onChange={(e) => setTimeoutValue(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="edit-status">Expected Status</Label>
          <Input
            id="edit-status"
            type="number"
            required
            value={expectedStatus}
            onChange={(e) => setExpectedStatus(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

function LoadTestStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <p className="text-xs font-medium text-[var(--color-text-faint)]">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-[var(--color-text)]">{value}</p>
    </div>
  );
}

function LoadTestPanel({ endpointId }: { endpointId: number }) {
  const [concurrency, setConcurrency] = useState(10);
  const [requestCount, setRequestCount] = useState(50);
  const runLoadTest = useRunLoadTest(endpointId);
  const result: LoadTestResult | undefined = runLoadTest.data;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Load Test</h3>
          <p className="max-w-md text-xs text-[var(--color-text-muted)]">
            Fire a burst of concurrent requests to measure latency and throughput under load. Results aren't
            counted toward uptime or availability.
          </p>
        </div>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            runLoadTest.mutate({ concurrency, requestCount });
          }}
        >
          <div>
            <Label htmlFor="lt-concurrency">Concurrency</Label>
            <Input
              id="lt-concurrency"
              type="number"
              min={1}
              max={50}
              required
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="w-24"
            />
          </div>
          <div>
            <Label htmlFor="lt-request-count">Requests</Label>
            <Input
              id="lt-request-count"
              type="number"
              min={1}
              max={500}
              required
              value={requestCount}
              onChange={(e) => setRequestCount(Number(e.target.value))}
              className="w-24"
            />
          </div>
          <Button type="submit" disabled={runLoadTest.isPending}>
            <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
            {runLoadTest.isPending ? "Running…" : "Run Load Test"}
          </Button>
        </form>
      </div>

      {runLoadTest.isError && <p className="text-sm text-failure-400">Load test failed to run. Try again.</p>}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <LoadTestStat label="Throughput" value={`${result.throughput_rps} req/s`} />
            <LoadTestStat label="Error rate" value={`${result.error_rate}%`} />
            <LoadTestStat label="Success / Failure" value={`${result.success_count} / ${result.failure_count}`} />
            <LoadTestStat label="Duration" value={`${result.duration_ms} ms`} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <LoadTestStat label="Min" value={`${result.latency.min} ms`} />
            <LoadTestStat label="p50" value={`${result.latency.p50} ms`} />
            <LoadTestStat label="p95" value={`${result.latency.p95} ms`} />
            <LoadTestStat label="p99" value={`${result.latency.p99} ms`} />
            <LoadTestStat label="Max" value={`${result.latency.max} ms`} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--color-text-faint)]">Status code breakdown</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.status_code_breakdown).map(([code, count]) => (
                <Badge key={code} tone={code !== "error" && Number(code) < 400 ? "success" : "failure"}>
                  {code} × {count}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
