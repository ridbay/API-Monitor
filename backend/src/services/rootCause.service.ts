export type FailureCategory =
  | "timeout"
  | "dns"
  | "connection_refused"
  | "connection_reset"
  | "server_error"
  | "client_error"
  | "unknown";

export interface RootCause {
  category: FailureCategory;
  label: string;
}

// Ordered by specificity — network-level error strings are checked before
// falling back to the HTTP status code, since a timeout can carry any status.
const ERROR_PATTERNS: Array<{ test: RegExp; category: FailureCategory; label: string }> = [
  { test: /timeout/i, category: "timeout", label: "Timeout — no response within the configured window" },
  { test: /ENOTFOUND|EAI_AGAIN|getaddrinfo/i, category: "dns", label: "DNS/config issue — hostname isn't resolving" },
  {
    test: /ECONNREFUSED/i,
    category: "connection_refused",
    label: "Connection refused — service likely down or port closed",
  },
  {
    test: /ECONNRESET|socket hang up/i,
    category: "connection_reset",
    label: "Connection reset — service dropped mid-request",
  },
];

export function classifyFailure(statusCode: number | null, errorMessage: string | null): RootCause {
  if (errorMessage) {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test.test(errorMessage)) {
        return { category: pattern.category, label: pattern.label };
      }
    }
  }

  if (statusCode !== null) {
    if (statusCode >= 500) {
      return {
        category: "server_error",
        label: `Server-side error (${statusCode}) — likely a bug or overload on the target service`,
      };
    }
    if (statusCode >= 400) {
      return { category: "client_error", label: `Client-side error (${statusCode}) — check the request, auth, or route` };
    }
  }

  return { category: "unknown", label: "Unknown — no clear pattern in the error" };
}
