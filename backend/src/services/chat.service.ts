import { dashboardService, HEALTHY_AVAILABILITY_THRESHOLD } from "./dashboard.service";
import { reportService } from "./report.service";

export interface ChatResponse {
  intent: string;
  reply: string;
}

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

const HELP_TEXT = `Here's what I can answer:
• "is <endpoint name> up?" — status of a specific endpoint
• "what's down" / "what's failing" — every endpoint currently down or degraded
• "summary" / "how are we doing" — fleet-wide health overview
• "outages today" — today's outages with likely cause
• "slowest apis" / "fastest apis" — this week's latency rankings
• "most unstable" — endpoints with the worst success rate this week

I'm a keyword-matched assistant over the platform's own data, not a language model — ask me one of the above and I'll go look it up.`;

async function matchEndpoint(message: string) {
  const health = await dashboardService.getEndpointHealth();
  const lower = message.toLowerCase();

  const rawMatches = health
    .filter((entry) => lower.includes(entry.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);

  // A shorter match that's itself a substring of an already-found longer
  // match (e.g. "MOMO" inside "MOMO DEVELOPER") isn't a real ambiguity —
  // the longer name is clearly the more specific, intended match.
  const matches = rawMatches.filter(
    (entry, i) => !rawMatches.slice(0, i).some((longer) => longer.name.toLowerCase().includes(entry.name.toLowerCase()))
  );

  return { health, matches };
}

function describeEndpoint(entry: {
  name: string;
  status: string;
  availability: number;
  avg_response_time: number;
  status_since: string | null;
}): string {
  if (entry.status === "unknown") {
    return `${entry.name} hasn't been checked yet, so I don't have a status for it.`;
  }

  const streak = entry.status === "down" ? "down" : "up";
  return `${entry.name} is currently **${entry.status}** — ${streak} for ${formatDuration(entry.status_since)}. Availability: ${entry.availability.toFixed(2)}%, avg response time: ${entry.avg_response_time}ms.`;
}

export async function answer(message: string): Promise<ChatResponse> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { intent: "help", reply: HELP_TEXT };
  }

  const lower = trimmed.toLowerCase();

  // Most specific first: does the message name a registered endpoint?
  const { health, matches } = await matchEndpoint(trimmed);
  if (matches.length === 1) {
    return { intent: "endpoint_status", reply: describeEndpoint(matches[0]) };
  }
  if (matches.length > 1) {
    const names = matches.map((m) => m.name).join(", ");
    return {
      intent: "endpoint_ambiguous",
      reply: `A few endpoints match that: ${names}. Which one did you mean?`,
    };
  }

  if (/^help$|what can you do|commands|capabilit/i.test(lower)) {
    return { intent: "help", reply: HELP_TEXT };
  }

  if (/summary|overview|how('?s| is| are) (things|it|we|the platform)|overall health/i.test(lower)) {
    const summary = await dashboardService.getSummary();
    return {
      intent: "summary",
      reply: `${summary.total_endpoints} endpoint(s) tracked — ${summary.healthy_endpoints} healthy, ${summary.warning_endpoints} in warning, ${summary.failed_endpoints} down. Average response time across the fleet: ${summary.avg_response_time}ms.`,
    };
  }

  if (/down|failing|broken|issue|problem|degrad/i.test(lower)) {
    const unhealthy = health.filter(
      (e) => e.status === "down" || (e.status === "up" && e.availability < HEALTHY_AVAILABILITY_THRESHOLD)
    );
    if (unhealthy.length === 0) {
      return { intent: "list_down", reply: "Nothing's down or degraded right now — everything's healthy." };
    }
    const lines = unhealthy
      .map((e) => `• ${e.name} — ${e.status} (${e.availability.toFixed(2)}% availability, ${formatDuration(e.status_since)})`)
      .join("\n");
    return { intent: "list_down", reply: `${unhealthy.length} endpoint(s) need attention:\n${lines}` };
  }

  if (/outage|incident/i.test(lower)) {
    const daily = await reportService.getDaily();
    if (!daily.outages || daily.outages.length === 0) {
      return { intent: "outages_today", reply: `No outages today (${daily.date}) — clean sheet so far.` };
    }
    const lines = daily.outages
      .slice(0, 10)
      .map((o) => {
        const time = new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const cause = o.likely_cause?.label ?? o.error_message ?? "unknown cause";
        return `• ${o.endpoint_name} at ${time} — ${cause}`;
      })
      .join("\n");
    const more = daily.outages.length > 10 ? `\n…and ${daily.outages.length - 10} more.` : "";
    return { intent: "outages_today", reply: `${daily.outages.length} outage(s) today (${daily.date}):\n${lines}${more}` };
  }

  if (/slowest/i.test(lower)) {
    const weekly = await reportService.getWeekly();
    const slowest = weekly.top_slowest_apis ?? weekly.top_slow_apis;
    if (slowest.length === 0) return { intent: "slowest", reply: "Not enough data yet to rank latency this week." };
    const lines = slowest.map((e) => `• ${e.name} — ${e.avg_response_time}ms avg`).join("\n");
    return { intent: "slowest", reply: `Slowest APIs this week:\n${lines}` };
  }

  if (/fastest|quickest/i.test(lower)) {
    const weekly = await reportService.getWeekly();
    if (weekly.top_fast_apis.length === 0) return { intent: "fastest", reply: "Not enough data yet to rank latency this week." };
    const lines = weekly.top_fast_apis.map((e) => `• ${e.name} — ${e.avg_response_time}ms avg`).join("\n");
    return { intent: "fastest", reply: `Fastest APIs this week:\n${lines}` };
  }

  if (/unstable|flaky|least stable/i.test(lower)) {
    const weekly = await reportService.getWeekly();
    if (weekly.most_unstable_apis.length === 0) {
      return { intent: "unstable", reply: "Nothing's been unstable this week — every endpoint's at 100% success rate." };
    }
    const lines = weekly.most_unstable_apis.map((e) => `• ${e.name} — ${e.success_rate}% success rate`).join("\n");
    return { intent: "unstable", reply: `Most unstable APIs this week:\n${lines}` };
  }

  return {
    intent: "fallback",
    reply: `I didn't catch that as one of my known queries. ${HELP_TEXT}`,
  };
}
