import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { useCreateEndpoint } from "../hooks/useEndpoints";
import type { CreateEndpointInput, HttpMethod, MonitoringInterval } from "../types";

const DEFAULT_FORM: CreateEndpointInput = {
  name: "",
  url: "",
  method: "GET",
  expected_status: 200,
  timeout: 5000,
  interval: "5m",
};

export function EndpointNew() {
  const navigate = useNavigate();
  const createEndpoint = useCreateEndpoint();
  const [form, setForm] = useState<CreateEndpointInput>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createEndpoint.mutateAsync(form);
      navigate("/endpoints");
    } catch {
      setError("Failed to create endpoint. Check the values and try again.");
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Add Endpoint</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Register a new API or website for monitoring.</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              required
              placeholder="MTN Website"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              required
              placeholder="https://www.mtn.ng"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="method">HTTP Method</Label>
              <Select
                id="method"
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as HttpMethod })}
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="interval">Monitoring Interval</Label>
              <Select
                id="interval"
                value={form.interval}
                onChange={(e) => setForm({ ...form, interval: e.target.value as MonitoringInterval })}
              >
                <option value="1m">1 Minute</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="30m">30 Minutes</option>
                <option value="1h">1 Hour</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="expected_status">Expected Status Code</Label>
              <Input
                id="expected_status"
                type="number"
                required
                value={form.expected_status}
                onChange={(e) => setForm({ ...form, expected_status: Number(e.target.value) })}
              />
            </div>

            <div>
              <Label htmlFor="timeout">Timeout (ms)</Label>
              <Input
                id="timeout"
                type="number"
                required
                value={form.timeout}
                onChange={(e) => setForm({ ...form, timeout: Number(e.target.value) })}
              />
            </div>
          </div>

          {error && <p className="text-sm text-failure-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => navigate("/endpoints")}>
              Cancel
            </Button>
            <Button type="submit" disabled={createEndpoint.isPending}>
              {createEndpoint.isPending ? "Saving…" : "Save Endpoint"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
