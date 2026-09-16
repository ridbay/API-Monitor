import { pool } from "../config/db";
import { EndpointStatistics } from "../types";

export const statisticsRepository = {
  async findByEndpoint(endpointId: number): Promise<EndpointStatistics | null> {
    const result = await pool.query(`SELECT * FROM endpoint_statistics WHERE endpoint_id = $1`, [endpointId]);
    return result.rows[0] ?? null;
  },

  async findAll(): Promise<EndpointStatistics[]> {
    const result = await pool.query(`SELECT * FROM endpoint_statistics`);
    return result.rows;
  },

  async upsert(endpointId: number, stats: {
    availability: number;
    success_rate: number;
    avg_response_time: number;
    last_checked: Date;
  }): Promise<EndpointStatistics> {
    const result = await pool.query(
      `INSERT INTO endpoint_statistics (endpoint_id, availability, success_rate, avg_response_time, last_checked)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint_id) DO UPDATE SET
         availability = EXCLUDED.availability,
         success_rate = EXCLUDED.success_rate,
         avg_response_time = EXCLUDED.avg_response_time,
         last_checked = EXCLUDED.last_checked
       RETURNING *`,
      [endpointId, stats.availability, stats.success_rate, stats.avg_response_time, stats.last_checked]
    );
    return result.rows[0];
  },
};
