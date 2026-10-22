// Turns one raw log line into an HTTP request record. Supported formats:
//   - JSON lines (app/Envoy/ingress logs, and Fluent Bit's Kubernetes wrapper
//     {"log": "...", "kubernetes": {...}} around any of the formats below)
//   - nginx/Apache common & combined, with an optional leading vhost
//   - HAProxy HTTP log (the OpenShift router)
//   - morgan-style app logs: "GET /path 200 12.3 ms"

export interface ParsedRequest {
  method: string;
  path: string;
  status: number;
  host?: string;
  scheme?: string;
  latencyMs?: number;
  service?: string;
  pod?: string;
  timestamp?: Date;
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

export function parseLogLine(line: string): ParsedRequest | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parsed = trimmed.startsWith("{") ? parseJson(trimmed) : parseText(trimmed);
  if (!parsed || !METHODS.has(parsed.method) || !(parsed.status >= 100 && parsed.status < 600)) return null;
  return parsed;
}

// ---------- JSON ----------

function parseJson(line: string): ParsedRequest | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }

  const k8s = (obj.kubernetes ?? {}) as Record<string, any>;
  const k8sMeta = {
    pod: str(k8s.pod_name ?? k8s.pod?.name),
    service: str(k8s.labels?.app ?? k8s.labels?.["app.kubernetes.io/name"] ?? k8s.container_name),
  };

  // Fluent Bit / container runtime wrapper: the request is inside "log".
  if (typeof obj.log === "string" && !pick(obj, "method", "request_method")) {
    const inner = parseLogLine(obj.log);
    return inner && { ...inner, pod: inner.pod ?? k8sMeta.pod, service: inner.service ?? k8sMeta.service };
  }

  const method = str(pick(obj, "method", "request_method", "http.method", "http.request.method", "req.method"))?.toUpperCase();
  const rawUrl = str(pick(obj, "path", "uri", "request_uri", "url", "http.target", "http.url", "url.path", "req.url"));
  const status = num(pick(obj, "status", "status_code", "response_code", "http.status_code", "http.response.status_code", "res.statusCode"));
  if (!method || !rawUrl || status === undefined) return null;

  const location = splitUrl(rawUrl);
  const latency =
    num(pick(obj, "duration_ms", "latency_ms", "response_time_ms", "responseTime", "elapsed_ms", "duration")) ??
    secondsToMs(num(pick(obj, "request_time", "upstream_response_time", "duration_s")));

  return {
    method,
    path: location.path,
    status,
    host: location.host ?? hostOnly(str(pick(obj, "host", "http_host", "authority", ":authority", "http.host", "server_name"))),
    scheme: location.scheme ?? str(pick(obj, "scheme", "http.scheme", "x_forwarded_proto")),
    latencyMs: latency,
    service: str(pick(obj, "service", "service_name", "app", "upstream_cluster")) ?? k8sMeta.service,
    pod: str(pick(obj, "pod", "pod_name", "hostname")) ?? k8sMeta.pod,
    timestamp: date(pick(obj, "time", "timestamp", "@timestamp", "time_local", "start_time")),
  };
}

// ---------- Text formats ----------

// [haproxy[pid]: ]client:port [accept_date] frontend backend/server Tq/Tw/Tc/Tr/Tt status bytes ... {captured headers} "METHOD /path HTTP/1.1"
const HAPROXY =
  /\[([^\]]+)\] (\S+) (\S+)\/(\S+) -?\d+\/-?\d+\/-?\d+\/-?\d+\/\+?(\d+) (\d{3}) .*?(?:\{([^}]*)\} )?"(\S+) (\S+)[^"]*"/;
// [vhost[:port] ]client ident user [time] "METHOD /path HTTP/x" status bytes [rest]
const COMBINED = /^(?:(\S+) )?(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) \S+(.*)$/;
const MORGAN = /^(?:.*?\s)?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\S+) (\d{3}) ([\d.]+) ms/;

function parseText(line: string): ParsedRequest | null {
  const h = HAPROXY.exec(line);
  if (h) {
    const [, accepted, , backend, server, totalMs, status, captured, method, url] = h;
    const location = splitUrl(url);
    const route = openshiftRoute(backend);
    const capturedHost = captured?.split("|")[0];
    return {
      method,
      path: location.path,
      status: Number(status),
      host: location.host ?? hostOnly(capturedHost || undefined),
      latencyMs: Number(totalMs),
      service: route ?? backend,
      pod: server !== "<NOSRV>" ? server.replace(/^pod:/, "").split(":")[0] : undefined,
      timestamp: haproxyDate(accepted),
    };
  }

  const c = COMBINED.exec(line);
  if (c) {
    const [, vhost, , time, method, url, status, rest] = c;
    const location = splitUrl(url);
    return {
      method,
      path: location.path,
      status: Number(status),
      host: location.host ?? hostOnly(vhost) ?? hostOnly(keyValue(rest, "host")),
      latencyMs: trailingLatency(rest),
      service: keyValue(rest, "service") ?? keyValue(rest, "upstream"),
      pod: keyValue(rest, "pod"),
      timestamp: clfDate(time),
    };
  }

  const m = MORGAN.exec(line);
  if (m) {
    const location = splitUrl(m[2]);
    return { method: m[1], path: location.path, status: Number(m[3]), host: location.host, latencyMs: Math.round(Number(m[4])) };
  }

  return null;
}

// ---------- Path normalization ----------

const SEGMENT_RULES: Array<[RegExp, string]> = [
  [/^\d+$/, ":id"],
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, ":uuid"],
  [/^\d{4}-\d{2}-\d{2}([T_ ][\d:.]+Z?)?$/, ":date"],
  [/^[0-9a-f]{16,}$/i, ":hash"],
  [/^[^@/]+@[^@/]+\.[a-z]{2,}$/i, ":email"],
  // Opaque tokens: long, and mixing letters with digits.
  [/^(?=.*\d)(?=.*[a-z])[a-z0-9_-]{20,}$/i, ":token"],
  // Short codes like ORD12345 or abc123def: 3+ digits mixed with letters.
  [/^(?=(?:.*\d){3})(?=.*[a-z])[a-z0-9_-]{6,}$/i, ":id"],
];

// Replaces per-request values in a path with placeholders so that
// /api/v1/users/49102 and /api/v1/users/7 count as one route.
export function normalizePath(path: string): string {
  const segments = path.split("/").filter(Boolean).map((segment) => {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // Malformed escape; classify the raw segment.
    }
    for (const [pattern, placeholder] of SEGMENT_RULES) if (pattern.test(decoded)) return placeholder;
    return segment;
  });
  return "/" + segments.join("/");
}

const STATIC_ASSET = /\.(js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|otf|mp4|webm)$/i;

export function isStaticAsset(path: string): boolean {
  return STATIC_ASSET.test(path);
}

// ---------- Helpers ----------

function splitUrl(raw: string): { path: string; host?: string; scheme?: string } {
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return { path: cleanPath(u.pathname), host: u.host.toLowerCase(), scheme: u.protocol.replace(":", "") };
    } catch {
      // fall through to path handling
    }
  }
  return { path: cleanPath(raw.split(/[?#]/)[0]) };
}

function cleanPath(path: string): string {
  const collapsed = ("/" + path).replace(/\/{2,}/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/$/, "") : collapsed;
}

// host[:port], lowercased. Default ports are dropped so "api.example.com:443"
// and "api.example.com" are one host; other ports are part of the address.
function hostOnly(value: string | undefined): string | undefined {
  if (!value || value === "-") return undefined;
  const host = value.replace(/^https?:\/\//, "").split("/")[0].replace(/:(80|443)$/, "").toLowerCase();
  return /^[a-z0-9.-]*[a-z0-9](:\d{1,5})?$/.test(host) ? host : undefined;
}

// OpenShift router backends look like be_http:<namespace>:<route> (or be_edge_http, be_secure, be_tcp).
function openshiftRoute(backend: string): string | undefined {
  const parts = backend.split(":");
  return parts.length === 3 && parts[0].startsWith("be_") ? parts[2] : undefined;
}

// Trailing latency after the standard fields: "rt=0.123", "request_time=0.123",
// "upstream_response_time=0.120", or a bare seconds value like "0.123".
function trailingLatency(rest: string): number | undefined {
  const kv = keyValue(rest, "rt") ?? keyValue(rest, "request_time") ?? keyValue(rest, "upstream_response_time");
  if (kv !== undefined) return secondsToMs(Number(kv));
  const ms = /(?:^|\s)(\d+(?:\.\d+)?)ms(?:\s|$)/.exec(rest);
  if (ms) return Math.round(Number(ms[1]));
  const bare = /(?:^|\s)(\d+\.\d+)\s*$/.exec(rest.replace(/"[^"]*"/g, ""));
  return bare ? secondsToMs(Number(bare[1])) : undefined;
}

function keyValue(text: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${key}=("?)([^\\s"]+)\\1`).exec(text);
  return match && match[2] !== "-" ? match[2] : undefined;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in obj) return obj[key];
    // Dotted keys also match nested objects: "http.method" → obj.http.method
    const nested = key.split(".").reduce<unknown>((acc, part) => (acc && typeof acc === "object" ? (acc as any)[part] : undefined), obj);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" && value !== "-" ? value : undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function secondsToMs(seconds: number | undefined): number | undefined {
  return seconds === undefined || !Number.isFinite(seconds) ? undefined : Math.round(seconds * 1000);
}

function date(value: unknown): Date | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? clfDate(String(value)) : d;
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

// 10/Oct/2026:13:55:36 +0000
function clfDate(value: string): Date | undefined {
  const m = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2})(?:\.\d+)? ?([+-]\d{4})?$/.exec(value);
  if (!m || !MONTHS[m[2]]) return undefined;
  const tz = m[5] ? `${m[5].slice(0, 3)}:${m[5].slice(3)}` : "Z";
  const d = new Date(`${m[3]}-${MONTHS[m[2]]}-${m[1]}T${m[4]}${tz}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// 06/Feb/2026:12:14:14.655 (HAProxy omits the zone; the router logs in UTC)
function haproxyDate(value: string): Date | undefined {
  return clfDate(value.replace(/\.\d+$/, ""));
}
