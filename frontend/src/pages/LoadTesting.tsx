import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gauge, Play, Square, Pencil, Trash2, Plus } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Table, Tbody, Td, Th, Thead } from "../components/ui/Table";
import { useEndpoints } from "../hooks/useEndpoints";
import { loadSuiteApi } from "../services/api";
import { errorMessage } from "../lib/operator";
import type { LoadRunStatus, LoadSuite, LoadSummary, LoadTick, SuiteInput } from "../types";

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]";

const STATUS_STYLE: Record<LoadRunStatus, string> = {
  RUNNING: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  COMPLETED: "bg-success-500/10 text-success-300 border-success-500/20",
  CANCELLED: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border-[var(--color-border)]",
  FAILED: "bg-failure-500/10 text-failure-300 border-failure-500/20",
};

const EMPTY_SUITE: SuiteInput = {
  name: "",
  endpoints: [],
  profile: { virtual_users: 10, ramp_up_s: 5, duration_s: 30, max_rps: null },
};

export function LoadTesting() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id: number | null; input: SuiteInput } | null>(null);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: suites } = useQuery({ queryKey: ["load-suites"], queryFn: loadSuiteApi.listSuites });
  const { data: runs } = useQuery({ queryKey: ["load-runs"], queryFn: loadSuiteApi.listRuns, refetchInterval: 10_000 });

  // Reattach to a run already in progress (e.g. after navigating away).
  const shownRunId = activeRunId ?? runs?.find((r) => r.status === "RUNNING")?.id ?? null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["load-suites"] });
    queryClient.invalidateQueries({ queryKey: ["load-runs"] });
  };

  const run = useMutation({
    mutationFn: (suiteId: number) => loadSuiteApi.run(suiteId),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      setActiveRunId(r.id);
      refresh();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => loadSuiteApi.deleteSuite(id),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Load Testing</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Concurrent multi-endpoint suites with ramp-up and rate limits, run in an isolated worker.
            </p>
          </div>
        </div>
        <Button onClick={() => setEditing({ id: null, input: EMPTY_SUITE })}>
          <Plus className="h-4 w-4" /> New suite
        </Button>
      </div>

      {error && <p className="text-sm text-failure-300">{error}</p>}

      {editing && (
        <SuiteForm
          initial={editing.input}
          suiteId={editing.id}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {shownRunId !== null && <RunView key={shownRunId} runId={shownRunId} onFinished={refresh} onClose={() => setActiveRunId(null)} />}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Suites</h2>
        {!suites?.length ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">No suites yet. Create one to run a load test.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {suites.map((suite) => (
              <SuiteCard
                key={suite.id}
                suite={suite}
                busy={run.isPending || runs?.some((r) => r.status === "RUNNING") === true}
                onRun={() => run.mutate(suite.id)}
                onEdit={() => setEditing({ id: suite.id, input: { name: suite.name, endpoints: suite.endpoints, profile: suite.profile } })}
                onDelete={() => confirm(`Delete suite "${suite.name}"?`) && remove.mutate(suite.id)}
                onViewRun={(id) => setActiveRunId(id)}
              />
            ))}
          </div>
        )}
      </Card>

      {runs && runs.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Recent runs</h2>
          <Table>
            <Thead>
              <tr>
                <Th>Suite</Th>
                <Th>Started</Th>
                <Th>Status</Th>
                <Th>Requests</Th>
                <Th>Throughput</Th>
                <Th>Errors</Th>
                <Th>p95</Th>
              </tr>
            </Thead>
            <Tbody>
              {runs.map((r) => (
                <tr key={r.id} onClick={() => setActiveRunId(r.id)} className="cursor-pointer transition-colors hover:bg-[var(--color-surface-hover)]">
                  <Td className="font-medium text-[var(--color-text)]">{r.suite_name}</Td>
                  <Td className="text-xs">{new Date(r.started_at).toLocaleString()}</Td>
                  <Td>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  </Td>
                  <Td className="font-mono text-xs">{r.summary?.requests.toLocaleString() ?? "–"}</Td>
                  <Td className="font-mono text-xs">{r.summary ? `${r.summary.throughput_rps} rps` : "–"}</Td>
                  <Td className="font-mono text-xs">{r.summary ? `${r.summary.error_rate_pct}%` : "–"}</Td>
                  <Td className="font-mono text-xs">{r.summary ? `${r.summary.latency.p95}ms` : "–"}</Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function SuiteCard({
  suite,
  busy,
  onRun,
  onEdit,
  onDelete,
  onViewRun,
}: {
  suite: LoadSuite;
  busy: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewRun: (id: number) => void;
}) {
  const { profile, last_run: last } = suite;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--color-text)]">{suite.name}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {suite.endpoints.length} endpoint(s) · {profile.virtual_users} VUs · {profile.ramp_up_s}s ramp · {profile.duration_s}s
            {profile.max_rps ? ` · ≤${profile.max_rps} rps` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" className="!px-2 !py-1" onClick={onEdit} aria-label="Edit suite" title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" className="!px-2 !py-1 hover:!text-failure-400" onClick={onDelete} aria-label="Delete suite" title="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {last && (
        <button onClick={() => onViewRun(last.id)} className="block text-left text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          Last run {new Date(last.started_at).toLocaleString()}:{" "}
          <span className={`rounded border px-1 text-[10px] font-semibold ${STATUS_STYLE[last.status]}`}>{last.status}</span>
          {last.summary && ` ${last.summary.throughput_rps} rps · ${last.summary.error_rate_pct}% errors · p95 ${last.summary.latency.p95}ms`}
        </button>
      )}
      <Button className="!py-1.5 text-xs" disabled={busy} onClick={onRun} title={busy ? "Another run is in progress" : undefined}>
        <Play className="h-3.5 w-3.5" /> Run
      </Button>
    </div>
  );
}

function SuiteForm({
  initial,
  suiteId,
  onDone,
  onCancel,
}: {
  initial: SuiteInput;
  suiteId: number | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { data: endpoints } = useEndpoints();
  const [input, setInput] = useState<SuiteInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const weights = new Map(input.endpoints.map((e) => [e.endpoint_id, e.weight]));

  const save = useMutation({
    mutationFn: () => (suiteId ? loadSuiteApi.updateSuite(suiteId, input) : loadSuiteApi.createSuite(input)),
    onMutate: () => setError(null),
    onSuccess: onDone,
    onError: (err) => setError(errorMessage(err)),
  });

  const toggle = (id: number, on: boolean) =>
    setInput((s) => ({
      ...s,
      endpoints: on ? [...s.endpoints, { endpoint_id: id, weight: 1 }] : s.endpoints.filter((e) => e.endpoint_id !== id),
    }));
  const setWeight = (id: number, weight: number) =>
    setInput((s) => ({ ...s, endpoints: s.endpoints.map((e) => (e.endpoint_id === id ? { ...e, weight } : e)) }));
  const setProfile = (key: keyof SuiteInput["profile"], value: number | null) =>
    setInput((s) => ({ ...s, profile: { ...s.profile, [key]: value } }));
  const numberField = (key: "virtual_users" | "ramp_up_s" | "duration_s", label: string, max: number) => (
    <label className="block text-xs text-[var(--color-text-muted)]">
      {label}
      <input
        type="number"
        min={key === "ramp_up_s" ? 0 : 1}
        max={max}
        value={input.profile[key]}
        onChange={(e) => setProfile(key, Number(e.target.value))}
        className={`${inputClass} mt-1`}
      />
    </label>
  );

  return (
    <Card className="space-y-4">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">{suiteId ? "Edit suite" : "New suite"}</h2>
      <input value={input.name} onChange={(e) => setInput({ ...input, name: e.target.value })} placeholder="Suite name, e.g. Checkout peak" className={inputClass} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numberField("virtual_users", "Virtual users (≤200)", 200)}
        {numberField("ramp_up_s", "Ramp-up (s)", 300)}
        {numberField("duration_s", "Duration (s, ≤600)", 600)}
        <label className="block text-xs text-[var(--color-text-muted)]">
          Max RPS (optional)
          <input
            type="number"
            min={1}
            max={2000}
            value={input.profile.max_rps ?? ""}
            onChange={(e) => setProfile("max_rps", e.target.value ? Number(e.target.value) : null)}
            placeholder="unlimited"
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>

      <div>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]">Endpoints and traffic weight (share of requests)</p>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border)] p-2">
          {endpoints?.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={weights.has(e.id)} onChange={(ev) => toggle(e.id, ev.target.checked)} aria-label={`Include ${e.name}`} />
              <span className="min-w-0 flex-1 truncate text-[var(--color-text)]" title={e.url}>
                {e.name} <span className="font-mono text-[var(--color-text-faint)]">{e.method} {e.url}</span>
              </span>
              {weights.has(e.id) && (
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={weights.get(e.id)}
                  onChange={(ev) => setWeight(e.id, Number(ev.target.value))}
                  aria-label={`Weight for ${e.name}`}
                  className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[var(--color-text)]"
                />
              )}
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-[var(--color-text-faint)]">
          Each request is sent with the endpoint's configured method and no body; only load-test endpoints that are safe to hit repeatedly.
        </p>
      </div>

      {error && <p className="text-sm text-failure-300">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={save.isPending || !input.name.trim() || !input.endpoints.length} onClick={() => save.mutate()}>
          Save suite
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function RunView({ runId, onFinished, onClose }: { runId: number; onFinished: () => void; onClose: () => void }) {
  const [ticks, setTicks] = useState<LoadTick[]>([]);
  const [end, setEnd] = useState<{ status: LoadRunStatus; summary: LoadSummary | null; error: string | null } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const source = new EventSource(loadSuiteApi.streamUrl(runId));
    source.addEventListener("tick", (e) => setTicks((prev) => [...prev, JSON.parse((e as MessageEvent).data)]));
    source.addEventListener("end", (e) => {
      setEnd(JSON.parse((e as MessageEvent).data));
      source.close();
      onFinished();
    });
    source.onerror = () => source.close();
    return () => source.close();
    // onFinished is a stable refresh callback; reconnecting on its identity would replay the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const latest = ticks[ticks.length - 1];
  const live = !end;
  const chartData = ticks.map((t) => ({ t: t.t, rps: t.rps, p95: t.latency.p95, errors: t.error_rate_pct }));

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          Run #{runId}{" "}
          {end ? (
            <span className={`ml-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[end.status]}`}>{end.status}</span>
          ) : (
            <span className="ml-1 rounded border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">LIVE</span>
          )}
        </h2>
        <div className="flex gap-2">
          {live && (
            <Button
              variant="secondary"
              className="!py-1 text-xs"
              disabled={cancelling}
              onClick={() => {
                setCancelling(true);
                loadSuiteApi.cancel(runId).catch(() => setCancelling(false));
              }}
            >
              <Square className="h-3.5 w-3.5" /> {cancelling ? "Stopping…" : "Stop"}
            </Button>
          )}
          {!live && (
            <Button variant="ghost" className="!py-1 text-xs" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {end?.error && <p className="text-sm text-failure-300">{end.error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(live
          ? [
              { label: "Elapsed", value: latest ? `${latest.t}s` : "starting…" },
              { label: "Active VUs", value: latest?.active_vus ?? "–" },
              { label: "Throughput", value: latest ? `${latest.rps} rps` : "–" },
              { label: "Errors", value: latest ? `${latest.error_rate_pct}%` : "–" },
              { label: "p95 latency", value: latest ? `${latest.latency.p95}ms` : "–" },
            ]
          : end?.summary
            ? [
                { label: "Requests", value: end.summary.requests.toLocaleString() },
                { label: "Throughput", value: `${end.summary.throughput_rps} rps` },
                { label: "Errors", value: `${end.summary.error_rate_pct}%` },
                { label: "p50 / p95", value: `${end.summary.latency.p50} / ${end.summary.latency.p95}ms` },
                { label: "p99 / max", value: `${end.summary.latency.p99} / ${end.summary.latency.max}ms` },
              ]
            : []
        ).map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">{kpi.label}</span>
            <div className="mt-0.5 font-mono text-lg font-bold text-[var(--color-text)]">{kpi.value}</div>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-3">
          <MiniChart title="Throughput (requests/s)" data={chartData} dataKey="rps" unit=" rps" />
          <MiniChart title="p95 latency (ms)" data={chartData} dataKey="p95" unit="ms" />
          <MiniChart title="Error rate (%)" data={chartData} dataKey="errors" unit="%" />
        </div>
      )}

      {end?.summary && end.summary.endpoints.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Endpoint</Th>
              <Th>Requests</Th>
              <Th>Errors</Th>
              <Th>p50</Th>
              <Th>p90</Th>
              <Th>p95</Th>
              <Th>p99</Th>
              <Th>Max</Th>
              <Th>Responses</Th>
            </tr>
          </Thead>
          <Tbody>
            {end.summary.endpoints.map((e) => (
              <tr key={e.endpoint_id}>
                <Td className="text-xs" title={e.url}>
                  <span className="font-medium text-[var(--color-text)]">{e.name}</span>
                </Td>
                <Td className="font-mono text-xs">{e.requests.toLocaleString()}</Td>
                <Td className={`font-mono text-xs ${e.error_rate_pct > 0 ? "text-failure-300" : ""}`}>{e.error_rate_pct}%</Td>
                <Td className="font-mono text-xs">{e.latency.p50}ms</Td>
                <Td className="font-mono text-xs">{e.latency.p90}ms</Td>
                <Td className="font-mono text-xs">{e.latency.p95}ms</Td>
                <Td className="font-mono text-xs">{e.latency.p99}ms</Td>
                <Td className="font-mono text-xs">{e.latency.max}ms</Td>
                <Td className="font-mono text-[10px]">
                  {Object.entries(e.status_codes)
                    .sort((a, b) => b[1] - a[1])
                    .map(([code, n]) => `${code}×${n}`)
                    .join(" ")}
                </Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Card>
  );
}

// One measure per chart: throughput, latency and error rate have different
// scales, so they get separate small charts instead of a shared dual axis.
function MiniChart({
  title,
  data,
  dataKey,
  unit,
}: {
  title: string;
  data: Array<Record<string, number>>;
  dataKey: string;
  unit: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">{title}</p>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="t" stroke="var(--color-text-faint)" fontSize={10} tickLine={false} tickFormatter={(t) => `${t}s`} />
            <YAxis stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ stroke: "var(--color-border-strong)" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: 8,
                fontSize: 11,
                color: "var(--color-text)",
              }}
              labelFormatter={(t) => `${t}s`}
              formatter={(v) => [`${v}${unit}`, title.split(" (")[0]]}
            />
            <Line type="monotone" dataKey={dataKey} stroke="var(--color-brand-400)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
