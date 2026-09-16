import { pool } from "../config/db";

export const endpointDetailService = {
  async getTrends(endpointId: number, hours: number) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const { rows } = await pool.query(
      `SELECT
         date_trunc('hour', created_at) AS bucket,
         AVG(response_time) FILTER (WHERE status = 'up')::int AS avg_response_time,
         COUNT(*) FILTER (WHERE status = 'up')::int AS up_count,
         COUNT(*)::int AS total_count
       FROM monitoring_results
       WHERE endpoint_id = $1 AND created_at >= $2
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [endpointId, since]
    );

    return rows.map((row) => ({
      timestamp: row.bucket,
      avg_response_time: row.avg_response_time ?? 0,
      availability: row.total_count > 0 ? Number(((row.up_count / row.total_count) * 100).toFixed(2)) : 0,
      up_count: row.up_count,
      down_count: row.total_count - row.up_count,
    }));
  },

  async getStatusCodeDistribution(endpointId: number, hours?: number) {
    if (hours) {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const { rows } = await pool.query(
        `SELECT status_code, COUNT(*)::int AS count
         FROM monitoring_results
         WHERE endpoint_id = $1 AND status_code IS NOT NULL AND created_at >= $2
         GROUP BY status_code
         ORDER BY count DESC`,
        [endpointId, since]
      );
      return rows;
    }

    const { rows } = await pool.query(
      `SELECT status_code, COUNT(*)::int AS count
       FROM monitoring_results
       WHERE endpoint_id = $1 AND status_code IS NOT NULL
       GROUP BY status_code
       ORDER BY count DESC`,
      [endpointId]
    );
    return rows;
  },
};
