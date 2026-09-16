import { pool } from "../config/db";
import { MonitoringResult } from "../types";

export interface CreateResultInput {
  endpoint_id: number;
  status: "up" | "down";
  status_code: number | null;
  response_time: number | null;
  error_message: string | null;
}

export const monitoringResultRepository = {
  async create(input: CreateResultInput): Promise<MonitoringResult> {
    const result = await pool.query(
      `INSERT INTO monitoring_results (endpoint_id, status, status_code, response_time, error_message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.endpoint_id, input.status, input.status_code, input.response_time, input.error_message]
    );
    return result.rows[0];
  },

  async findRecentFailures(limit = 20): Promise<Array<MonitoringResult & { endpoint_name: string }>> {
    const result = await pool.query(
      `SELECT mr.*, e.name AS endpoint_name
       FROM monitoring_results mr
       JOIN endpoints e ON e.id = mr.endpoint_id
       WHERE mr.status = 'down' AND e.deleted_at IS NULL
       ORDER BY mr.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  async findSince(since: Date): Promise<MonitoringResult[]> {
    const result = await pool.query(`SELECT * FROM monitoring_results WHERE created_at >= $1`, [since]);
    return result.rows;
  },
};
