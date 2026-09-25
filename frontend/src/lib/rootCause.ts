import type { FailureCategory } from "../types";

export const ROOT_CAUSE_TONE: Record<FailureCategory, "failure" | "warning" | "neutral"> = {
  timeout: "warning",
  dns: "failure",
  connection_refused: "failure",
  connection_reset: "warning",
  server_error: "failure",
  client_error: "warning",
  unknown: "neutral",
};

// Short badge text — the full explanation (RootCause.label) goes in a title
// tooltip instead, since it's a full sentence and badges need to stay compact.
export const ROOT_CAUSE_SHORT_LABEL: Record<FailureCategory, string> = {
  timeout: "Timeout",
  dns: "DNS/config",
  connection_refused: "Connection refused",
  connection_reset: "Connection reset",
  server_error: "Server error",
  client_error: "Client error",
  unknown: "Unknown",
};
