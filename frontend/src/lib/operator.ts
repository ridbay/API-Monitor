import { useState } from "react";
import { isAxiosError } from "axios";

const OPERATOR_KEY = "operator-name";

// Remembered per browser so approvers don't retype it. There's no login yet,
// so this is the identity recorded in the audit trail.
export function useOperatorName(): [string, (name: string) => void] {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(OPERATOR_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const save = (value: string) => {
    setName(value);
    try {
      localStorage.setItem(OPERATOR_KEY, value);
    } catch {
      // Storage unavailable (private window); the name lasts for this session only.
    }
  };
  return [name, save];
}

export function errorMessage(err: unknown): string {
  if (isAxiosError(err)) return (err.response?.data as { error?: string } | undefined)?.error ?? err.message;
  return (err as Error).message;
}
