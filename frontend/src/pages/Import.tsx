import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Table, Tbody, Td, Th, Thead } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { importApi, openapiApi } from "../services/api";
import type { CreateEndpointInput, CsvPreviewResult, DiscoveredEndpoint } from "../types";

type Tab = "csv" | "openapi";

export function Import() {
  const [tab, setTab] = useState<Tab>("csv");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Import Endpoints</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Bring in multiple endpoints via CSV or auto-discover from OpenAPI/Swagger.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("csv")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "csv"
              ? "bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_4px_16px_-4px_rgba(99,102,241,0.5)]"
              : "border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          CSV Import
        </button>
        <button
          onClick={() => setTab("openapi")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "openapi"
              ? "bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_4px_16px_-4px_rgba(99,102,241,0.5)]"
              : "border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          OpenAPI Discovery
        </button>
      </div>

      {tab === "csv" ? <CsvImportPanel /> : <OpenApiImportPanel />}
    </div>
  );
}

function CsvImportPanel() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const result = await importApi.preview(file);
      setPreview(result);
    } catch {
      setError("Failed to parse CSV file.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!preview) return;
    const validEndpoints = preview.rows.filter((r) => r.data).map((r) => r.data!) as CreateEndpointInput[];
    setImporting(true);
    setError(null);
    try {
      await importApi.confirm(validEndpoints);
      navigate("/endpoints");
    } catch {
      setError("Failed to import endpoints.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <Label htmlFor="csv-file">CSV File</Label>
        <p className="mb-2 text-xs text-[var(--color-text-faint)]">
          Expected columns: name, url, method (optional: expected_status, timeout, interval)
        </p>
        <input
          ref={fileInputRef}
          id="csv-file"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-[var(--color-text-muted)] file:mr-4 file:rounded-lg file:border-0 file:bg-brand-500/15 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-300 hover:file:bg-brand-500/25"
        />
      </div>

      {loading && <p className="text-sm text-[var(--color-text-muted)]">Parsing…</p>}
      {error && <p className="text-sm text-failure-400">{error}</p>}

      {preview && (
        <>
          <div className="flex gap-2 text-sm">
            <Badge tone="neutral">{preview.total} rows</Badge>
            <Badge tone="success">{preview.valid} valid</Badge>
            {preview.invalid > 0 && <Badge tone="failure">{preview.invalid} invalid</Badge>}
          </div>

          <Table>
            <Thead>
              <tr>
                <Th>Row</Th>
                <Th>Name</Th>
                <Th>URL</Th>
                <Th>Method</Th>
                <Th>Status</Th>
              </tr>
            </Thead>
            <Tbody>
              {preview.rows.map((row) => (
                <tr key={row.row} className="transition-colors hover:bg-[var(--color-surface-hover)]">
                  <Td>{row.row}</Td>
                  <Td>{row.data?.name ?? "—"}</Td>
                  <Td className="max-w-xs truncate">{row.data?.url ?? "—"}</Td>
                  <Td>{row.data?.method ?? "—"}</Td>
                  <Td>{row.error ? <Badge tone="failure">{row.error}</Badge> : <Badge tone="success">OK</Badge>}</Td>
                </tr>
              ))}
            </Tbody>
          </Table>

          <div className="flex justify-end">
            <Button onClick={handleImport} disabled={preview.valid === 0 || importing}>
              {importing ? "Importing…" : `Import ${preview.valid} Endpoint${preview.valid === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function OpenApiImportPanel() {
  const navigate = useNavigate();
  const [specUrl, setSpecUrl] = useState("");
  const [discovered, setDiscovered] = useState<DiscoveredEndpoint[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDiscover(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setDiscovered(null);
    try {
      const result = await openapiApi.discover(specUrl);
      setDiscovered(result.endpoints);
      setSelected(new Set(result.endpoints.map((_, i) => i)));
    } catch {
      setError("Failed to fetch or parse the OpenAPI spec.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleImport() {
    if (!discovered) return;
    const endpoints: CreateEndpointInput[] = discovered
      .filter((_, i) => selected.has(i))
      .map((d) => ({ name: d.name, url: d.url, method: d.method, expected_status: 200, timeout: 5000, interval: "5m" }));

    setImporting(true);
    setError(null);
    try {
      await openapiApi.import(endpoints);
      navigate("/endpoints");
    } catch {
      setError("Failed to import discovered endpoints.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="space-y-4">
      <form onSubmit={handleDiscover} className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="spec-url">Swagger / OpenAPI URL</Label>
          <Input
            id="spec-url"
            type="url"
            required
            placeholder="https://api.example.com/swagger.json"
            value={specUrl}
            onChange={(e) => setSpecUrl(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? "Discovering…" : "Discover"}
        </Button>
      </form>

      {error && <p className="text-sm text-failure-400">{error}</p>}

      {discovered && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-muted)]">
              Found {discovered.length} endpoint{discovered.length === 1 ? "" : "s"} — {selected.size} selected
            </p>
            <div className="flex gap-3 text-xs font-medium text-brand-400">
              <button type="button" className="hover:text-brand-300" onClick={() => setSelected(new Set(discovered.map((_, i) => i)))}>
                Select all
              </button>
              <button type="button" className="hover:text-brand-300" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
          </div>

          <Table>
            <Thead>
              <tr>
                <Th></Th>
                <Th>Method</Th>
                <Th>Name</Th>
                <Th>URL</Th>
              </tr>
            </Thead>
            <Tbody>
              {discovered.map((endpoint, i) => (
                <tr key={i} className="transition-colors hover:bg-[var(--color-surface-hover)]">
                  <Td>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-500"
                      checked={selected.has(i)}
                      onChange={() => toggle(i)}
                    />
                  </Td>
                  <Td>
                    <Badge tone="neutral">{endpoint.method}</Badge>
                  </Td>
                  <Td>{endpoint.name}</Td>
                  <Td className="max-w-xs truncate">{endpoint.url}</Td>
                </tr>
              ))}
            </Tbody>
          </Table>

          <div className="flex justify-end">
            <Button onClick={handleImport} disabled={selected.size === 0 || importing}>
              {importing ? "Importing…" : `Import ${selected.size} Endpoint${selected.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
