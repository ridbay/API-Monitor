import { ZodError } from "zod";
import { dashboardService, HEALTHY_AVAILABILITY_THRESHOLD } from "./dashboard.service";
import { reportService } from "./report.service";
import { endpointRepository } from "../repositories/endpoint.repository";
import { endpointService, createEndpointSchema, updateEndpointSchema } from "./endpoint.service";
import { executeCheck } from "./monitoring.service";
import { runLoadTest } from "./loadTest.service";
import { ChatEntity, formatDuration, matchEndpoint, toEntity } from "./chat.service";

// Shared between LLM providers (currently just llmChatGemini.service.ts, but
// structured so a second provider can plug in) so a tool added once is
// available everywhere, and no provider can drift in what it's capable of.

export const SYSTEM_PROMPT = `You are an assistant embedded in an internal API monitoring dashboard. Answer questions about monitored endpoints strictly using the tools provided — never guess or invent data that didn't come from a tool result. If a tool reports no match for a name, say so rather than assuming which endpoint was meant. Keep replies short and factual (1-3 sentences), like a terse ops engineer.

run_check, run_load_test, create_endpoint, set_endpoint_active, and update_endpoint all have real side effects on the monitoring system — only call one when the user's message clearly asks for that specific action, never as a guess or a "while I'm at it" extra. Never call create_endpoint unless the user gives (or clearly implies) both a name and a URL to register. If any required detail for an action is missing or ambiguous, ask the user for it instead of calling the tool with a guess.`;

export interface ToolSpec {
  name: string;
  description: string;
  schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "get_endpoint_status",
    description: "Look up the current status, availability, and response time of one specific monitored endpoint by name.",
    schema: {
      type: "object",
      properties: { name: { type: "string", description: "The endpoint name or a substring of it, e.g. 'MOMO' or 'Github'." } },
      required: ["name"],
    },
  },
  {
    name: "list_endpoints",
    description: "List monitored endpoints filtered by status.",
    schema: {
      type: "object",
      properties: { filter: { type: "string", enum: ["up", "down_or_degraded", "all"] } },
      required: ["filter"],
    },
  },
  {
    name: "get_summary",
    description: "Get the fleet-wide health summary: total/healthy/warning/down endpoint counts and average response time.",
    schema: { type: "object", properties: {} },
  },
  {
    name: "get_outages_today",
    description: "Get today's outages across all endpoints, each with a likely root-cause classification.",
    schema: { type: "object", properties: {} },
  },
  {
    name: "get_weekly_rankings",
    description: "Get this week's endpoint rankings by a latency or stability metric.",
    schema: {
      type: "object",
      properties: { metric: { type: "string", enum: ["fastest", "slowest", "unstable"] } },
      required: ["metric"],
    },
  },
  {
    name: "run_check",
    description: "Trigger a real, immediate health check against one endpoint right now. Only call when explicitly asked to run/trigger/recheck a specific endpoint.",
    schema: {
      type: "object",
      properties: { name: { type: "string", description: "The endpoint name to check." } },
      required: ["name"],
    },
  },
  {
    name: "run_load_test",
    description: "Trigger a real concurrent load test (20 requests, concurrency 5) against one endpoint right now. Only call when explicitly asked for a load test or stress test.",
    schema: {
      type: "object",
      properties: { name: { type: "string", description: "The endpoint name to load test." } },
      required: ["name"],
    },
  },
  {
    name: "create_endpoint",
    description: "Register a new endpoint for monitoring — it starts being checked on the given interval immediately. Only call when explicitly asked to add, register, or start monitoring a new URL.",
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "A short label for the endpoint." },
        url: { type: "string", description: "The full URL to monitor, including https://." },
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "Defaults to GET if not specified." },
        expected_status: { type: "integer", description: "The HTTP status code that counts as healthy. Defaults to 200." },
        timeout: { type: "integer", description: "Request timeout in milliseconds. Defaults to 5000." },
        interval: { type: "string", enum: ["1m", "5m", "15m", "30m", "1h"], description: "How often to check it. Defaults to 5m." },
      },
      required: ["name", "url"],
    },
  },
  {
    name: "set_endpoint_active",
    description: "Pause or resume scheduled monitoring for an existing endpoint, without deleting it. Only call when explicitly asked to pause/stop/resume/restart/start monitoring for a specific already-registered endpoint — not for registering a brand new one.",
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The endpoint name or a substring of it." },
        active: { type: "boolean", description: "true to resume/start monitoring, false to pause/stop it." },
      },
      required: ["name", "active"],
    },
  },
  {
    name: "update_endpoint",
    description: "Change settings on an existing endpoint — its URL, HTTP method, expected status code, timeout, or check interval. Only include the fields being changed.",
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The endpoint name or a substring of it." },
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        expected_status: { type: "integer" },
        timeout: { type: "integer", description: "Timeout in milliseconds." },
        interval: { type: "string", enum: ["1m", "5m", "15m", "30m", "1h"] },
      },
      required: ["name"],
    },
  },
];

export interface ToolOutcome {
  forModel: unknown;
  entities?: ChatEntity[];
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  const health = await dashboardService.getEndpointHealth();

  switch (name) {
    case "get_endpoint_status": {
      const matches = await matchEndpoint(String(input.name ?? ""), health);
      if (matches.length === 0) return { forModel: { error: "No endpoint matches that name." } };
      if (matches.length > 1) return { forModel: { ambiguous: matches.map((m) => m.name) } };
      const entry = matches[0];
      return {
        forModel: { ...entry, down_for: formatDuration(entry.status_since) },
        entities: [toEntity(entry, `${entry.availability.toFixed(2)}% • ${entry.avg_response_time}ms`)],
      };
    }

    case "list_endpoints": {
      const filter = String(input.filter ?? "all");
      const filtered =
        filter === "up"
          ? health.filter((e) => e.status === "up")
          : filter === "down_or_degraded"
            ? health.filter((e) => e.status === "down" || (e.status === "up" && e.availability < HEALTHY_AVAILABILITY_THRESHOLD))
            : health;
      return {
        forModel: filtered.map((e) => ({
          name: e.name,
          status: e.status,
          availability: e.availability,
          avg_response_time: e.avg_response_time,
          duration: formatDuration(e.status_since),
        })),
        entities: filtered.map((e) => toEntity(e, `${e.status} • ${e.availability.toFixed(2)}%`)),
      };
    }

    case "get_summary": {
      return { forModel: await dashboardService.getSummary() };
    }

    case "get_outages_today": {
      const daily = await reportService.getDaily();
      const byEndpoint = new Map<number, { name: string; count: number; latestCause: string }>();
      for (const outage of daily.outages ?? []) {
        const existing = byEndpoint.get(outage.endpoint_id);
        const cause = outage.likely_cause?.label ?? outage.error_message ?? "unknown cause";
        if (existing) existing.count += 1;
        else byEndpoint.set(outage.endpoint_id, { name: outage.endpoint_name, count: 1, latestCause: cause });
      }
      const entities: ChatEntity[] = Array.from(byEndpoint.entries()).map(([endpoint_id, info]) => ({
        endpoint_id,
        name: info.name,
        status: "down",
        detail: `${info.count} outage(s) — ${info.latestCause}`,
      }));
      return {
        forModel: { date: daily.date, total_outages: daily.outages?.length ?? 0, affected_endpoints: Array.from(byEndpoint.values()) },
        entities: entities.length > 0 ? entities : undefined,
      };
    }

    case "get_weekly_rankings": {
      const weekly = await reportService.getWeekly();
      const metric = String(input.metric ?? "slowest");

      if (metric === "fastest") {
        return {
          forModel: weekly.top_fast_apis,
          entities: weekly.top_fast_apis.map((e: { endpoint_id: number; name: string; avg_response_time: number }) => ({
            endpoint_id: e.endpoint_id,
            name: e.name,
            status: "unknown" as const,
            detail: `${e.avg_response_time}ms avg`,
          })),
        };
      }
      if (metric === "unstable") {
        return {
          forModel: weekly.most_unstable_apis,
          entities: weekly.most_unstable_apis.map((e: { endpoint_id: number; name: string; success_rate: number }) => ({
            endpoint_id: e.endpoint_id,
            name: e.name,
            status: "unknown" as const,
            detail: `${e.success_rate}% success rate`,
          })),
        };
      }
      const slowest = weekly.top_slowest_apis ?? weekly.top_slow_apis;
      return {
        forModel: slowest,
        entities: slowest.map((e: { endpoint_id: number; name: string; avg_response_time: number }) => ({
          endpoint_id: e.endpoint_id,
          name: e.name,
          status: "unknown" as const,
          detail: `${e.avg_response_time}ms avg`,
        })),
      };
    }

    case "run_check": {
      const matches = await matchEndpoint(String(input.name ?? ""), health);
      if (matches.length === 0) return { forModel: { error: "No endpoint matches that name." } };
      if (matches.length > 1) return { forModel: { ambiguous: matches.map((m) => m.name) } };
      const endpoint = await endpointRepository.findById(matches[0].endpoint_id);
      if (!endpoint) return { forModel: { error: "Endpoint no longer exists." } };
      await executeCheck(endpoint);
      const fresh = await endpointRepository.findByIdWithStats(endpoint.id);
      return {
        forModel: fresh,
        entities: fresh
          ? [
              {
                endpoint_id: endpoint.id,
                name: endpoint.name,
                status: fresh.status,
                detail: `${Number(fresh.availability).toFixed(2)}% • ${fresh.avg_response_time}ms`,
              },
            ]
          : undefined,
      };
    }

    case "run_load_test": {
      const matches = await matchEndpoint(String(input.name ?? ""), health);
      if (matches.length === 0) return { forModel: { error: "No endpoint matches that name." } };
      if (matches.length > 1) return { forModel: { ambiguous: matches.map((m) => m.name) } };
      const endpoint = await endpointRepository.findById(matches[0].endpoint_id);
      if (!endpoint) return { forModel: { error: "Endpoint no longer exists." } };
      const result = await runLoadTest(endpoint, { concurrency: 5, requestCount: 20 });
      return {
        forModel: result,
        entities: [
          {
            endpoint_id: endpoint.id,
            name: endpoint.name,
            status: result.error_rate > 0 ? "down" : "up",
            detail: `${result.throughput_rps} req/s • p95 ${result.latency.p95}ms`,
          },
        ],
      };
    }

    case "create_endpoint": {
      try {
        const parsed = createEndpointSchema.parse(input);
        const created = await endpointService.create(parsed);
        return {
          forModel: created,
          entities: [{ endpoint_id: created.id, name: created.name, status: "unknown", detail: "just registered" }],
        };
      } catch (err) {
        if (err instanceof ZodError) return { forModel: { error: err.issues.map((i) => i.message).join("; ") } };
        throw err;
      }
    }

    case "set_endpoint_active": {
      const matches = await matchEndpoint(String(input.name ?? ""), health);
      if (matches.length === 0) return { forModel: { error: "No endpoint matches that name." } };
      if (matches.length > 1) return { forModel: { ambiguous: matches.map((m) => m.name) } };

      const active = Boolean(input.active);
      const updated = await endpointRepository.setActive(matches[0].endpoint_id, active);
      if (!updated) return { forModel: { error: "Endpoint no longer exists." } };
      return {
        forModel: updated,
        entities: [
          {
            endpoint_id: updated.id,
            name: updated.name,
            status: "unknown",
            detail: active ? "monitoring resumed" : "monitoring paused",
          },
        ],
      };
    }

    case "update_endpoint": {
      const matches = await matchEndpoint(String(input.name ?? ""), health);
      if (matches.length === 0) return { forModel: { error: "No endpoint matches that name." } };
      if (matches.length > 1) return { forModel: { ambiguous: matches.map((m) => m.name) } };

      // "name" here identifies which endpoint to update, not a new name to
      // rename it to — the tool schema deliberately doesn't expose renaming.
      const { name: _matchName, ...fields } = input;
      try {
        const parsed = updateEndpointSchema.parse(fields);
        if (Object.keys(parsed).length === 0) return { forModel: { error: "No fields to update were provided." } };
        const updated = await endpointService.update(matches[0].endpoint_id, parsed);
        if (!updated) return { forModel: { error: "Endpoint no longer exists." } };
        return {
          forModel: updated,
          entities: [{ endpoint_id: updated.id, name: updated.name, status: "unknown", detail: "settings updated" }],
        };
      } catch (err) {
        if (err instanceof ZodError) return { forModel: { error: err.issues.map((i) => i.message).join("; ") } };
        throw err;
      }
    }

    default:
      return { forModel: { error: `Unknown tool ${name}` } };
  }
}

export function dedupeEntities(entities: ChatEntity[]): ChatEntity[] {
  const seen = new Map<number, ChatEntity>();
  for (const entity of entities) seen.set(entity.endpoint_id, entity);
  return Array.from(seen.values());
}
