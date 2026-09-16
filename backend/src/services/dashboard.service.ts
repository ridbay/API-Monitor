import { pool } from "../config/db";
import { endpointRepository } from "../repositories/endpoint.repository";
import { monitoringResultRepository } from "../repositories/monitoringResult.repository";

const HEALTHY_AVAILABILITY_THRESHOLD = 98;

export const dashboardService = {
  async getSummary() {
    const endpoints = await endpointRepository.findAllWithStats();

    let healthy = 0;
    let warning = 0;
    let failed = 0;
    let responseTimeSum = 0;
    let responseTimeCount = 0;

    for (const endpoint of endpoints) {
      if (endpoint.status === "down") {
        failed += 1;
      } else if (endpoint.status === "up" && Number(endpoint.availability) < HEALTHY_AVAILABILITY_THRESHOLD) {
        warning += 1;
      } else if (endpoint.status === "up") {
        healthy += 1;
      }

      if (endpoint.avg_response_time > 0) {
        responseTimeSum += Number(endpoint.avg_response_time);
        responseTimeCount += 1;
      }
    }

    return {
      total_endpoints: endpoints.length,
      healthy_endpoints: healthy,
      warning_endpoints: warning,
      failed_endpoints: failed,
      avg_response_time: responseTimeCount > 0 ? Math.round(responseTimeSum / responseTimeCount) : 0,
    };
  },

  async getRecentFailures(limit = 20) {
    return monitoringResultRepository.findRecentFailures(limit);
  },

  async getEndpointHealth() {
    const endpoints = await endpointRepository.findAllWithStats();
    if (endpoints.length === 0) return [];

    const ids = endpoints.map((e) => e.id);
    const { rows } = await pool.query(
      `SELECT endpoint_id, status, created_at
       FROM monitoring_results
       WHERE endpoint_id = ANY($1::int[])
       ORDER BY endpoint_id, created_at DESC`,
      [ids]
    );

    const historyByEndpoint = new Map<number, Array<{ status: string; created_at: string }>>();
    for (const row of rows) {
      const list = historyByEndpoint.get(row.endpoint_id) ?? [];
      list.push(row);
      historyByEndpoint.set(row.endpoint_id, list);
    }

    return endpoints.map((endpoint) => {
      const history = historyByEndpoint.get(endpoint.id) ?? [];
      let statusSince: string | null = null;

      if (history.length > 0) {
        const currentStatus = history[0].status;
        let i = 0;
        while (i < history.length && history[i].status === currentStatus) i++;
        statusSince = history[i - 1].created_at;
      }

      return {
        endpoint_id: endpoint.id,
        name: endpoint.name,
        status: endpoint.status,
        availability: Number(endpoint.availability),
        avg_response_time: endpoint.avg_response_time,
        status_since: statusSince,
      };
    });
  },

  async getTrends(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const { rows } = await pool.query(
      `SELECT
         date_trunc('hour', mr.created_at) AS bucket,
         AVG(mr.response_time) FILTER (WHERE mr.status = 'up')::int AS avg_response_time,
         COUNT(*) FILTER (WHERE mr.status = 'up')::int AS up_count,
         COUNT(*)::int AS total_count
       FROM monitoring_results mr
       JOIN endpoints e ON e.id = mr.endpoint_id
       WHERE mr.created_at >= $1 AND e.deleted_at IS NULL
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [since]
    );

    return rows.map((row) => ({
      timestamp: row.bucket,
      avg_response_time: row.avg_response_time ?? 0,
      availability: row.total_count > 0 ? Number(((row.up_count / row.total_count) * 100).toFixed(2)) : 0,
    }));
  },
};
