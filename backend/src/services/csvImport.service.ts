import { parse } from "csv-parse/sync";
import { createEndpointSchema } from "./endpoint.service";
import { CreateEndpointInput } from "../repositories/endpoint.repository";

export interface CsvRowResult {
  row: number;
  data?: CreateEndpointInput;
  error?: string;
}

export function parseCsv(buffer: Buffer): CsvRowResult[] {
  const records: Record<string, string>[] = parse(buffer, {
    columns: (header) => header.map((h: string) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((record, index) => {
    const candidate = {
      name: record.name,
      url: record.url,
      method: (record.method || "GET").toUpperCase(),
      expected_status: record.expected_status ? Number(record.expected_status) : undefined,
      timeout: record.timeout ? Number(record.timeout) : undefined,
      interval: record.interval || undefined,
    };

    const parsed = createEndpointSchema.safeParse(candidate);
    if (!parsed.success) {
      return { row: index + 2, error: parsed.error.issues.map((i) => i.message).join(", ") };
    }
    return { row: index + 2, data: parsed.data };
  });
}
