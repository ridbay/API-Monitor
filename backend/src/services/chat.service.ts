import { dashboardService, HEALTHY_AVAILABILITY_THRESHOLD } from "./dashboard.service";
import { reportService } from "./report.service";
import { endpointRepository } from "../repositories/endpoint.repository";
import { executeCheck } from "./monitoring.service";
import { runLoadTest } from "./loadTest.service";

export interface ChatEntity {
  endpoint_id: number;
  name: string;
  status: "up" | "down" | "unknown";
  detail: string;
}

export interface ChatResponse {
  intent: string;
  reply: string;
  entities?: ChatEntity[];
  suggestions?: string[];
}

type HealthEntry = Awaited<ReturnType<typeof dashboardService.getEndpointHealth>>[number];

function formatDuration(sinceIso: string | null): string {
  if (!sinceIso) return "an unknown amount of time";

  const ms = Date.now() - new Date(sinceIso).getTime();
  if (ms < 0) return "just now";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under a minute";

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const DEFAULT_SUGGESTIONS = ["what's down", "summary", "outages today"];

const HELP_TEXT = `Here's what I can answer or do:
• "is <endpoint name> up?" — status of a specific endpoint
• "what's up" / "what's down" — everything currently healthy, or needing attention
• "summary" — fleet-wide health overview
• "outages today" — today's outages with likely cause
• "slowest apis" / "fastest apis" / "most unstable" — this week's rankings
• "run a check on <endpoint name>" — trigger a real check right now
• "load test <endpoint name>" — fire a real concurrent load test right now

I'm a keyword-matched assistant over the platform's own data, not a language model — ask me one of the above and I'll go look it up or run it.`;

function toEntity(entry: HealthEntry, detail: string): ChatEntity {
  return { endpoint_id: entry.endpoint_id, name: entry.name, status: entry.status, detail };
}

async function matchEndpoint(message: string, health: HealthEntry[]) {
  const lower = message.toLowerCase();

  const rawMatches = health
    .filter((entry) => lower.includes(entry.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);

  // A shorter match that's itself a substring of an already-found longer
  // match (e.g. "MOMO" inside "MOMO DEVELOPER") isn't a real ambiguity —
  // the longer name is clearly the more specific, intended match.
  return rawMatches.filter(
    (entry, i) => !rawMatches.slice(0, i).some((longer) => longer.name.toLowerCase().includes(entry.name.toLowerCase()))
  );
}

function describeEndpoint(entry: HealthEntry): string {
  if (entry.status === "unknown") {
    return `${entry.name} hasn't been checked yet, so I don't have a status for it.`;
  }
  const streak = entry.status === "down" ? "down" : "up";
  return `${entry.name} is currently **${entry.status}** — ${streak} for ${formatDuration(entry.status_since)}. Availability: ${entry.availability.toFixed(2)}%, avg response time: ${entry.avg_response_time}ms.`;
}

const RUN_CHECK_PATTERN = /\brecheck\b|\brun (a |the )?check\b|\bcheck\b.*\bnow\b/i;
const LOAD_TEST_PATTERN = /\bload[- ]?test\b|\bstress[- ]?test\b/i;

export async function answer(message: string): Promise<ChatResponse> {
  const trimmed = message.trim();
  if (!trimmed) return { intent: "help", reply: HELP_TEXT, suggestions: DEFAULT_SUGGESTIONS };

  const lower = trimmed.toLowerCase();
  const health = await dashboardService.getEndpointHealth();

  // Action intents are checked first and require naming an endpoint —
  // "run a check on MOMO" should trigger the action, not fall through to a
  // plain status lookup just because the message also contains "MOMO".
  if (RUN_CHECK_PATTERN.test(lower) || LOAD_TEST_PATTERN.test(lower)) {
    const matches = await matchEndpoint(trimmed, health);

    if (matches.length === 0) {
      return {
        intent: "action_needs_endpoint",
        reply: 'Which endpoint should I run that on? Try naming it, e.g. "run a check on MOMO".',
      };
    }
    if (matches.length > 1) {
      return {
        intent: "endpoint_ambiguous",
        reply: `A few endpoints match that: ${matches.map((m) => m.name).join(", ")}. Which one did you mean?`,
      };
    }

    const endpoint = await endpointRepository.findById(matches[0].endpoint_id);
    if (!endpoint) {
      return { intent: "action_needs_endpoint", reply: "That endpoint doesn't exist anymore — try another name." };
    }

    if (LOAD_TEST_PATTERN.test(lower)) {
      const result = await runLoadTest(endpoint, { concurrency: 5, requestCount: 20 });
      return {
        intent: "action_load_test",
        reply: `Ran a load test on ${endpoint.name}: ${result.success_count}/${result.request_count} succeeded (${result.error_rate}% error rate), p95 latency ${result.latency.p95}ms, throughput ${result.throughput_rps} req/s. Not counted toward its uptime stats.`,
        entities: [
          {
            endpoint_id: endpoint.id,
            name: endpoint.name,
            status: result.error_rate > 0 ? "down" : "up",
            detail: `${result.throughput_rps} req/s • p95 ${result.latency.p95}ms`,
          },
        ],
        suggestions: [`is ${endpoint.name} up?`],
      };
    }

    await executeCheck(endpoint);
    const fresh = await endpointRepository.findByIdWithStats(endpoint.id);
    return {
      intent: "action_run_check",
      reply: fresh
        ? `Checked ${endpoint.name} just now — it's **${fresh.status}** (${Number(fresh.availability).toFixed(2)}% availability, ${fresh.avg_response_time}ms).`
        : `Checked ${endpoint.name} just now.`,
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
      suggestions: [`is ${endpoint.name} up?`],
    };
  }

  // Most specific read-only intent next: does the message name a registered endpoint?
  const matches = await matchEndpoint(trimmed, health);
  if (matches.length === 1) {
    const entry = matches[0];
    return {
      intent: "endpoint_status",
      reply: describeEndpoint(entry),
      entities: [toEntity(entry, `${entry.availability.toFixed(2)}% • ${entry.avg_response_time}ms`)],
      suggestions: entry.status === "down" ? ["outages today", `run a check on ${entry.name}`] : ["what's down"],
    };
  }
  if (matches.length > 1) {
    return {
      intent: "endpoint_ambiguous",
      reply: `A few endpoints match that: ${matches.map((m) => m.name).join(", ")}. Which one did you mean?`,
    };
  }

  if (/^help$|what can you do|commands|capabilit/i.test(lower)) {
    return { intent: "help", reply: HELP_TEXT, suggestions: DEFAULT_SUGGESTIONS };
  }

  if (/summary|overview|how('?s| is| are) (things|it|we|the platform)|overall health/i.test(lower)) {
    const summary = await dashboardService.getSummary();
    return {
      intent: "summary",
      reply: `${summary.total_endpoints} endpoint(s) tracked — ${summary.healthy_endpoints} healthy, ${summary.warning_endpoints} in warning, ${summary.failed_endpoints} down. Average response time across the fleet: ${summary.avg_response_time}ms.`,
      suggestions: ["what's down", "outages today"],
    };
  }

  if (/\bup\b|healthy|operational/i.test(lower)) {
    const upEndpoints = health.filter((e) => e.status === "up");
    if (upEndpoints.length === 0) {
      return { intent: "list_up", reply: "Nothing's currently up — every endpoint is down or hasn't been checked yet.", suggestions: ["summary"] };
    }
    return {
      intent: "list_up",
      reply: `${upEndpoints.length} endpoint(s) currently up.`,
      entities: upEndpoints.map((e) => toEntity(e, `${e.availability.toFixed(2)}% • ${e.avg_response_time}ms`)),
      suggestions: ["what's down", "slowest apis"],
    };
  }

  if (/down|failing|broken|issue|problem|degrad/i.test(lower)) {
    const unhealthy = health.filter(
      (e) => e.status === "down" || (e.status === "up" && e.availability < HEALTHY_AVAILABILITY_THRESHOLD)
    );
    if (unhealthy.length === 0) {
      return { intent: "list_down", reply: "Nothing's down or degraded right now — everything's healthy.", suggestions: ["summary"] };
    }
    return {
      intent: "list_down",
      reply: `${unhealthy.length} endpoint(s) need attention.`,
      entities: unhealthy.map((e) => toEntity(e, `${e.status} • ${e.availability.toFixed(2)}% • ${formatDuration(e.status_since)}`)),
      suggestions: ["outages today"],
    };
  }

  if (/outage|incident/i.test(lower)) {
    const daily = await reportService.getDaily();
    if (!daily.outages || daily.outages.length === 0) {
      return { intent: "outages_today", reply: `No outages today (${daily.date}) — clean sheet so far.`, suggestions: ["summary"] };
    }

    const byEndpoint = new Map<number, { name: string; count: number; latestCause: string }>();
    for (const outage of daily.outages) {
      const existing = byEndpoint.get(outage.endpoint_id);
      const cause = outage.likely_cause?.label ?? outage.error_message ?? "unknown cause";
      if (existing) {
        existing.count += 1;
      } else {
        byEndpoint.set(outage.endpoint_id, { name: outage.endpoint_name, count: 1, latestCause: cause });
      }
    }

    const entities: ChatEntity[] = Array.from(byEndpoint.entries()).map(([endpoint_id, info]) => ({
      endpoint_id,
      name: info.name,
      status: "down",
      detail: `${info.count} outage(s) — ${info.latestCause}`,
    }));

    return {
      intent: "outages_today",
      reply: `${daily.outages.length} outage(s) today (${daily.date}) across ${entities.length} endpoint(s).`,
      entities,
      suggestions: ["most unstable", "what's down"],
    };
  }

  if (/slowest/i.test(lower)) {
    const weekly = await reportService.getWeekly();
    const slowest = weekly.top_slowest_apis ?? weekly.top_slow_apis;
    if (slowest.length === 0) return { intent: "slowest", reply: "Not enough data yet to rank latency this week." };
    return {
      intent: "slowest",
      reply: "Slowest APIs this week.",
      entities: slowest.map((e) => ({ endpoint_id: e.endpoint_id, name: e.name, status: "unknown", detail: `${e.avg_response_time}ms avg` })),
      suggestions: ["fastest apis", "most unstable"],
    };
  }

  if (/fastest|quickest/i.test(lower)) {
    const weekly = await reportService.getWeekly();
    if (weekly.top_fast_apis.length === 0) return { intent: "fastest", reply: "Not enough data yet to rank latency this week." };
    return {
      intent: "fastest",
      reply: "Fastest APIs this week.",
      entities: weekly.top_fast_apis.map((e) => ({ endpoint_id: e.endpoint_id, name: e.name, status: "unknown", detail: `${e.avg_response_time}ms avg` })),
      suggestions: ["slowest apis"],
    };
  }

  if (/unstable|flaky|least stable/i.test(lower)) {
    const weekly = await reportService.getWeekly();
    if (weekly.most_unstable_apis.length === 0) {
      return { intent: "unstable", reply: "Nothing's been unstable this week — every endpoint's at 100% success rate." };
    }
    return {
      intent: "unstable",
      reply: "Most unstable APIs this week.",
      entities: weekly.most_unstable_apis.map((e) => ({ endpoint_id: e.endpoint_id, name: e.name, status: "unknown", detail: `${e.success_rate}% success rate` })),
      suggestions: ["outages today"],
    };
  }

  return { intent: "fallback", reply: `I didn't catch that as one of my known queries. ${HELP_TEXT}`, suggestions: DEFAULT_SUGGESTIONS };
}
