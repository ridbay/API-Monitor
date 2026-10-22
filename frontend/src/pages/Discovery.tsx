import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar, Upload, Check, X, RotateCcw, ExternalLink } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Table, Tbody, Td, Th, Thead } from "../components/ui/Table";
import { discoveryApi } from "../services/api";
import { errorMessage } from "../lib/operator";
import type { DiscoveredRoute, DiscoveredRouteStatus, LogIngestResult } from "../types";

const TABS: Array<{ key: DiscoveredRouteStatus | "all"; label: string }> = [
  { key: "NEW", label: "New" },
  { key: "MONITORED", label: "Already monitored" },
  { key: "PROMOTED", label: "Promoted" },
  { key: "IGNORED", label: "Ignored" },
  { key: "all", label: "All" },
];

const STATUS_STYLE: Record<DiscoveredRouteStatus, string> = {
  NEW: "bg-brand-500/10 text-brand-300 border-brand-500/20",
  MONITORED: "bg-success-500/10 text-success-300 border-success-500/20",
  PROMOTED: "bg-success-500/10 text-success-300 border-success-500/20",
  IGNORED: "bg-[var(--color-surface-2)] text-[var(--color-text-faint)] border-[var(--color-border)]",
};

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]";

export function Discovery() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DiscoveredRouteStatus | "all">("NEW");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: summary } = useQuery({ queryKey: ["discovery-summary"], queryFn: discoveryApi.summary, refetchInterval: 15000 });
  const { data: routes, isLoading } = useQuery({
    queryKey: ["discovery-routes", tab, search],
    queryFn: () => discoveryApi.listRoutes({ status: tab, q: search || undefined }),
    refetchInterval: 15000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["discovery-routes"] });
    queryClient.invalidateQueries({ queryKey: ["discovery-summary"] });
  };

  const action = useMutation({
    mutationFn: ({ route, kind, url }: { route: DiscoveredRoute; kind: "promote" | "ignore" | "restore"; url?: string }) =>
      kind === "promote" ? discoveryApi.promote(route.id, { url }) : kind === "ignore" ? discoveryApi.ignore(route.id) : discoveryApi.restore(route.id),
    onMutate: () => setError(null),
    onError: (err) => setError(errorMessage(err)),
    onSuccess: (_data, { kind }) => {
      refresh();
      if (kind === "promote") queryClient.invalidateQueries({ queryKey: ["endpoints"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
          <Radar className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Endpoint Discovery</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Routes found in access logs, normalized (e.g. <code className="font-mono text-xs">/users/:id</code>) and ready to promote to monitoring.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "New routes", value: summary?.counts.NEW },
          { label: "Already monitored", value: summary?.counts.MONITORED },
          { label: "Promoted", value: summary?.counts.PROMOTED },
          { label: "Ignored", value: summary?.counts.IGNORED },
          { label: "Hosts", value: summary?.hosts },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">{kpi.label}</span>
            <div className="mt-1 font-mono text-2xl font-bold text-[var(--color-text)]">{kpi.value ?? "–"}</div>
          </div>
        ))}
      </div>

      <IngestCard onIngested={refresh} />

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "bg-brand-500/15 text-brand-300"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by path, host or service" className={`${inputClass} sm:w-64`} />
        </div>

        {error && <p className="text-sm text-failure-300">{error}</p>}

        {isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading routes…</p>
        ) : !routes?.length ? (
          <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
            {tab === "NEW" ? "No new routes. Ingest some access logs above." : "Nothing here."}
          </p>
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Route</Th>
                <Th>Service</Th>
                <Th>Requests</Th>
                <Th>5xx</Th>
                <Th>Latency</Th>
                <Th>Baseline</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {routes.map((route) => (
                <RouteRow key={route.id} route={route} busy={action.isPending} onAction={(kind, url) => action.mutate({ route, kind, url })} />
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function RouteRow({
  route,
  busy,
  onAction,
}: {
  route: DiscoveredRoute;
  busy: boolean;
  onAction: (kind: "promote" | "ignore" | "restore", url?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(`${route.scheme}://${route.host}${route.sample_path}`);

  return (
    <>
      <tr className="transition-colors hover:bg-[var(--color-surface-hover)]">
        <Td className="font-mono text-xs" title={`Sample: ${route.sample_path}`}>
          <span className="mr-1.5 font-semibold text-brand-300">{route.method}</span>
          <span className="text-[var(--color-text)]">{route.path_template}</span>
          <div className="text-[10px] text-[var(--color-text-faint)]">{route.host}</div>
        </Td>
        <Td className="text-xs">
          {route.service_name ?? "–"}
          {route.pods.length > 0 && <div className="text-[10px] text-[var(--color-text-faint)]">{route.pods.length} pod(s)</div>}
        </Td>
        <Td className="font-mono text-xs">{route.request_count.toLocaleString()}</Td>
        <Td className={`font-mono text-xs ${route.error_rate_pct > 5 ? "text-failure-300" : route.error_rate_pct > 0 ? "text-warning-300" : ""}`}>
          {route.error_rate_pct}%
        </Td>
        <Td className="font-mono text-xs">
          {route.avg_latency_ms !== null ? (
            <>
              {route.avg_latency_ms}ms
              <div className="text-[10px] text-[var(--color-text-faint)]">p95 ≤{route.p95_latency_ms}ms</div>
            </>
          ) : (
            "–"
          )}
        </Td>
        <Td className="text-xs">
          {route.baseline_status ? (
            <span className={route.baseline_status === "up" ? "text-success-300" : "text-failure-300"} title={route.baseline_error ?? undefined}>
              {route.baseline_status_code ?? route.baseline_error} · {route.baseline_response_time}ms
            </span>
          ) : (
            <span className="text-[var(--color-text-faint)]">{route.method === "GET" ? "pending" : "not probed"}</span>
          )}
        </Td>
        <Td>
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[route.status]}`}>{route.status}</span>
        </Td>
        <Td>
          <div className="flex gap-1">
            {route.status === "NEW" && (
              <>
                <Button
                  variant="secondary"
                  className="!px-2 !py-1 text-xs"
                  disabled={busy || route.method !== "GET"}
                  title={route.method !== "GET" ? "Only GET routes can be monitored" : "Promote to monitoring"}
                  onClick={() => setEditing((e) => !e)}
                >
                  <Check className="h-3.5 w-3.5" /> Promote
                </Button>
                <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={busy} onClick={() => onAction("ignore")}>
                  <X className="h-3.5 w-3.5" /> Ignore
                </Button>
              </>
            )}
            {route.status === "IGNORED" && (
              <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={busy} onClick={() => onAction("restore")}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </Button>
            )}
            {route.endpoint_id && (
              <Link to={`/endpoints/${route.endpoint_id}`} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-brand-300 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Endpoint
              </Link>
            )}
          </div>
        </Td>
      </tr>
      {editing && (
        <tr className="bg-[var(--color-surface-2)]">
          <td colSpan={8} className="px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-xs text-[var(--color-text-muted)] sm:w-28">URL to monitor</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} className={`${inputClass} font-mono text-xs`} />
              <Button
                className="!py-1.5 text-xs"
                disabled={busy}
                onClick={() => {
                  onAction("promote", url);
                  setEditing(false);
                }}
              >
                Start monitoring
              </Button>
            </div>
            <p className="mt-1 text-[10px] text-[var(--color-text-faint)]">
              Prefilled with a real request from the logs. Swap the ID for a stable one if this record could disappear.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function IngestCard({ onIngested }: { onIngested: () => void }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [host, setHost] = useState("");
  const [service, setService] = useState("");
  const [result, setResult] = useState<LogIngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ingest = useMutation({
    mutationFn: () => {
      const defaults = { host: host.trim() || undefined, service: service.trim() || undefined };
      return file ? discoveryApi.uploadFile(file, defaults) : discoveryApi.ingestText(text, defaults);
    },
    onMutate: () => {
      setError(null);
      setResult(null);
    },
    onSuccess: (res) => {
      setResult(res);
      setText("");
      setFile(null);
      onIngested();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Ingest access logs</h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          nginx/Apache, OpenShift router (HAProxy), Envoy/JSON and app logs. Pipe them in with{" "}
          <code className="font-mono">curl --data-binary @access.log -H 'Content-Type: text/plain' /api/discovery/ingest</code>, or paste/upload here.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!!file}
        rows={4}
        placeholder={'10.0.0.1 - - [22/Oct/2026:10:00:00 +0000] "GET /api/users/42 HTTP/1.1" 200 512 "-" "curl" rt=0.031'}
        className={`${inputClass} font-mono text-xs`}
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Default host (when logs omit it)" className={inputClass} />
        <input value={service} onChange={(e) => setService(e.target.value)} placeholder="Default service name" className={inputClass} />
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--color-border-strong)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          <Upload className="h-4 w-4 shrink-0" />
          <span className="truncate">{file ? file.name : "Or choose a log file (≤20MB)"}</span>
          <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={ingest.isPending || (!file && !text.trim())} onClick={() => ingest.mutate()}>
          {ingest.isPending ? "Ingesting…" : "Ingest"}
        </Button>
        {file && (
          <button onClick={() => setFile(null)} className="text-xs text-[var(--color-text-muted)] hover:underline">
            Clear file
          </button>
        )}
        {error && <span className="text-sm text-failure-300">{error}</span>}
      </div>

      {result && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-text-muted)] space-y-1">
          <p>
            <strong className="text-[var(--color-text)]">{result.lines_parsed.toLocaleString()}</strong> of {result.lines_received.toLocaleString()} lines
            parsed → <strong className="text-[var(--color-text)]">{result.routes_seen}</strong> routes,{" "}
            <strong className="text-brand-300">{result.routes_new} new</strong>.
            {result.lines_skipped_static > 0 && ` ${result.lines_skipped_static} static-asset requests skipped.`}
            {result.lines_without_host > 0 && ` ${result.lines_without_host} lines had no host — set a default host.`}
            {result.routes_rejected > 0 && ` ${result.routes_rejected} routes over the per-host limit were dropped.`}
          </p>
          {result.lines_unparsed > 0 && (
            <details>
              <summary className="cursor-pointer">{result.lines_unparsed} lines not recognized as HTTP requests</summary>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-[var(--color-text-faint)]">
                {result.unparsed_samples.join("\n")}
              </pre>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
