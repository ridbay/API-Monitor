import axios from "axios";
import { HttpError } from "../middleware/errorHandler";

export interface DiscoveredEndpoint {
  name: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}

const SUPPORTED_METHODS = ["get", "post", "put", "patch", "delete"] as const;

function resolveBaseUrl(spec: any, specUrl: string): string {
  if (Array.isArray(spec.servers) && spec.servers[0]?.url) {
    const serverUrl = spec.servers[0].url as string;
    if (serverUrl.startsWith("http")) return serverUrl.replace(/\/$/, "");
    return new URL(serverUrl, specUrl).toString().replace(/\/$/, "");
  }

  if (spec.host) {
    const scheme = spec.schemes?.[0] ?? "https";
    const basePath = spec.basePath ?? "";
    return `${scheme}://${spec.host}${basePath}`.replace(/\/$/, "");
  }

  const parsed = new URL(specUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

export async function discoverEndpoints(specUrl: string): Promise<DiscoveredEndpoint[]> {
  let spec: any;
  try {
    const response = await axios.get(specUrl, { timeout: 10_000 });
    spec = response.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new HttpError(400, `Failed to fetch OpenAPI spec: ${message}`);
  }

  if (!spec?.paths) {
    throw new HttpError(400, "Response does not look like a valid OpenAPI/Swagger spec (missing 'paths')");
  }

  const baseUrl = resolveBaseUrl(spec, specUrl);
  const discovered: DiscoveredEndpoint[] = [];

  for (const [path, methods] of Object.entries<Record<string, unknown>>(spec.paths)) {
    for (const method of SUPPORTED_METHODS) {
      const operation = (methods as Record<string, unknown>)[method];
      if (!operation) continue;

      const op = operation as { summary?: string; operationId?: string };
      const name = op.summary || op.operationId || `${method.toUpperCase()} ${path}`;

      discovered.push({
        name,
        url: `${baseUrl}${path}`,
        method: method.toUpperCase() as DiscoveredEndpoint["method"],
      });
    }
  }

  return discovered;
}
