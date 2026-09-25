import { pool } from "../config/db";
import { endpointRepository } from "../repositories/endpoint.repository";
import { classifyFailure } from "./rootCause.service";

function toLocalDateLabel(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const reportService = {
  async getDaily(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_checks,
         COUNT(*) FILTER (WHERE mr.status = 'up')::int AS up_count,
         COUNT(*) FILTER (WHERE mr.status = 'down')::int AS failures,
         COALESCE(AVG(mr.response_time) FILTER (WHERE mr.status = 'up'), 0)::int AS avg_response_time
       FROM monitoring_results mr
       JOIN endpoints e ON e.id = mr.endpoint_id
       WHERE mr.created_at >= $1 AND mr.created_at < $2 AND e.deleted_at IS NULL`,
      [start, end]
    );

    const { rows: outages } = await pool.query(
      `SELECT
         mr.id,
         mr.endpoint_id,
         e.name AS endpoint_name,
         mr.status_code,
         mr.error_message,
         mr.created_at
       FROM monitoring_results mr
       JOIN endpoints e ON e.id = mr.endpoint_id
       WHERE mr.created_at >= $1 AND mr.created_at < $2 AND mr.status = 'down' AND e.deleted_at IS NULL
       ORDER BY mr.created_at DESC
       LIMIT 50`,
      [start, end]
    );

    const { total_checks, up_count, failures, avg_response_time } = rows[0];
    const availability = total_checks > 0 ? Number(((up_count / total_checks) * 100).toFixed(2)) : 0;

    const outagesWithCause = outages.map((outage) => ({
      ...outage,
      likely_cause: classifyFailure(outage.status_code, outage.error_message),
    }));

    return {
      date: toLocalDateLabel(start),
      availability,
      avg_response_time,
      total_checks,
      failures,
      outages: outagesWithCause,
    };
  },

  async getWeekly() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { rows: fastest } = await pool.query(
      `SELECT e.id AS endpoint_id, e.name, AVG(mr.response_time) FILTER (WHERE mr.status = 'up')::int AS avg_response_time
       FROM monitoring_results mr
       JOIN endpoints e ON e.id = mr.endpoint_id
       WHERE mr.created_at >= $1 AND e.deleted_at IS NULL
       GROUP BY e.id, e.name
       HAVING COUNT(*) FILTER (WHERE mr.status = 'up') > 0
       ORDER BY avg_response_time ASC
       LIMIT 5`,
      [since]
    );

    const { rows: slowest } = await pool.query(
      `SELECT e.id AS endpoint_id, e.name, AVG(mr.response_time) FILTER (WHERE mr.status = 'up')::int AS avg_response_time
       FROM monitoring_results mr
       JOIN endpoints e ON e.id = mr.endpoint_id
       WHERE mr.created_at >= $1 AND e.deleted_at IS NULL
       GROUP BY e.id, e.name
       HAVING COUNT(*) FILTER (WHERE mr.status = 'up') > 0
       ORDER BY avg_response_time DESC
       LIMIT 5`,
      [since]
    );

    const { rows: unstable } = await pool.query(
      `SELECT e.id AS endpoint_id, e.name,
         ROUND(100.0 * COUNT(*) FILTER (WHERE mr.status = 'up') / COUNT(*), 2) AS success_rate
       FROM monitoring_results mr
       JOIN endpoints e ON e.id = mr.endpoint_id
       WHERE mr.created_at >= $1 AND e.deleted_at IS NULL
       GROUP BY e.id, e.name
       HAVING ROUND(100.0 * COUNT(*) FILTER (WHERE mr.status = 'up') / COUNT(*), 2) < 100
       ORDER BY success_rate ASC
       LIMIT 5`,
      [since]
    );

    const { rows: bestAvailability } = await pool.query(
      `SELECT e.id AS endpoint_id, e.name,
         ROUND(100.0 * COUNT(*) FILTER (WHERE mr.status = 'up') / COUNT(*), 2) AS availability
       FROM monitoring_results mr
       JOIN endpoints e ON e.id = mr.endpoint_id
       WHERE mr.created_at >= $1 AND e.deleted_at IS NULL
       GROUP BY e.id, e.name
       HAVING ROUND(100.0 * COUNT(*) FILTER (WHERE mr.status = 'up') / COUNT(*), 2) > 80
       ORDER BY availability DESC
       LIMIT 5`,
      [since]
    );

    return {
      top_fast_apis: fastest,
      top_slow_apis: slowest,
      top_slowest_apis: slowest,
      most_unstable_apis: unstable,
      best_availability: bestAvailability,
      uptime_ranking: bestAvailability.map((i) => ({
        endpoint_id: i.endpoint_id,
        name: i.name,
        uptime: i.availability,
      })),
    };
  },

  async getMonthly() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endpoints = await endpointRepository.findAllWithStats();

    const servicesTracked = endpoints.length;
    const avgUptime =
      endpoints.length > 0
        ? Number((endpoints.reduce((sum, e) => sum + Number(e.availability), 0) / endpoints.length).toFixed(2))
        : 0;
    const currentlyDegraded = endpoints.filter(
      (e) => e.status === "down" || (e.status === "up" && Number(e.availability) < 98)
    ).length;

    // An "incident" is the start of a down-streak, not every failed check —
    // a 10-minute outage checked every minute should count once, not ten times.
    const { rows: incidentRows } = await pool.query(
      `WITH ordered AS (
         SELECT
           mr.status,
           mr.created_at,
           LAG(mr.status) OVER (PARTITION BY mr.endpoint_id ORDER BY mr.created_at) AS prev_status
         FROM monitoring_results mr
         JOIN endpoints e ON e.id = mr.endpoint_id
         WHERE e.deleted_at IS NULL
       )
       SELECT COUNT(*)::int AS incidents
       FROM ordered
       WHERE status = 'down' AND prev_status IS DISTINCT FROM 'down' AND created_at >= $1`,
      [since]
    );

    const { rows: uptimeRanking } = await pool.query(
      `SELECT e.id AS endpoint_id, e.name,
         ROUND(100.0 * COUNT(*) FILTER (WHERE mr.status = 'up') / COUNT(*), 2) AS uptime
       FROM monitoring_results mr
       JOIN endpoints e ON e.id = mr.endpoint_id
       WHERE mr.created_at >= $1 AND e.deleted_at IS NULL
       GROUP BY e.id, e.name
       ORDER BY uptime DESC
       LIMIT 5`,
      [since]
    );

    return {
      services_tracked: servicesTracked,
      avg_uptime: avgUptime,
      incidents: incidentRows[0].incidents,
      currently_degraded: currentlyDegraded,
      uptime_ranking: uptimeRanking,
    };
  },
};
