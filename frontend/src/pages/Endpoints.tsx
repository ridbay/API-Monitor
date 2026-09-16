import { Link } from "react-router-dom";
import { Plus, RotateCw, Trash2 } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Table, Tbody, Td, Th, Thead } from "../components/ui/Table";
import { StatusBadge } from "../components/StatusBadge";
import { useDeleteEndpoint, useEndpoints, useRunCheck } from "../hooks/useEndpoints";

export function Endpoints() {
  const { data: endpoints, isLoading } = useEndpoints();
  const deleteEndpoint = useDeleteEndpoint();
  const runCheck = useRunCheck();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Endpoints</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Manage the APIs being monitored.</p>
        </div>
        <Link to="/endpoints/new">
          <Button>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add Endpoint
          </Button>
        </Link>
      </div>

      <Card>
        {isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading endpoints…</p>
        ) : !endpoints || endpoints.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">No endpoints yet.</p>
            <Link
              to="/endpoints/new"
              className="mt-2 inline-block text-sm font-medium text-brand-400 hover:text-brand-300 hover:underline"
            >
              Add your first endpoint
            </Link>
          </div>
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>URL</Th>
                <Th>Status</Th>
                <Th>Last Checked</Th>
                <Th>Availability</Th>
                <Th>Response Time</Th>
                <Th>Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {endpoints.map((endpoint) => (
                <tr key={endpoint.id} className="transition-colors hover:bg-[var(--color-surface-hover)]">
                  <Td className="font-medium text-[var(--color-text)]">
                    <Link to={`/endpoints/${endpoint.id}`} className="hover:text-brand-300 hover:underline">
                      {endpoint.name}
                    </Link>
                  </Td>
                  <Td className="max-w-xs truncate font-mono text-xs text-[var(--color-text-faint)]">
                    {endpoint.method} {endpoint.url}
                  </Td>
                  <Td>
                    <StatusBadge status={endpoint.status} availability={Number(endpoint.availability)} />
                  </Td>
                  <Td>{endpoint.last_checked ? new Date(endpoint.last_checked).toLocaleString() : "Never"}</Td>
                  <Td>{Number(endpoint.availability).toFixed(2)}%</Td>
                  <Td>{endpoint.avg_response_time} ms</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1"
                        onClick={() => runCheck.mutate(endpoint.id)}
                        disabled={runCheck.isPending}
                        aria-label="Run check"
                        title="Run check"
                      >
                        <RotateCw className={`h-4 w-4 ${runCheck.isPending ? "animate-spin" : ""}`} strokeWidth={2} />
                      </Button>
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 hover:!bg-failure-500/10 hover:!text-failure-400"
                        onClick={() => {
                          if (confirm(`Delete "${endpoint.name}"?`)) deleteEndpoint.mutate(endpoint.id);
                        }}
                        aria-label="Delete"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
