import axios from "axios";
import { Endpoint } from "../types";
import { monitoringResultRepository } from "../repositories/monitoringResult.repository";
import { statisticsRepository } from "../repositories/statistics.repository";
import { pool } from "../config/db";

async function recalculateStats(endpointId: number) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'up')::int AS up_count,
       COALESCE(AVG(response_time) FILTER (WHERE status = 'up'), 0)::int AS avg_response_time
     FROM monitoring_results
     WHERE endpoint_id = $1`,
    [endpointId]
  );

  const { total, up_count, avg_response_time } = rows[0];
  const availability = total > 0 ? Number(((up_count / total) * 100).toFixed(2)) : 0;

  await statisticsRepository.upsert(endpointId, {
    availability,
    success_rate: availability,
    avg_response_time,
    last_checked: new Date(),
  });
}

export async function executeCheck(endpoint: Endpoint) {
  const startedAt = Date.now();

  try {
    const response = await axios.request({
      url: endpoint.url,
      method: endpoint.method,
      timeout: endpoint.timeout,
      validateStatus: () => true,
    });

    const responseTime = Date.now() - startedAt;
    const isUp = response.status === endpoint.expected_status;

    await monitoringResultRepository.create({
      endpoint_id: endpoint.id,
      status: isUp ? "up" : "down",
      status_code: response.status,
      response_time: responseTime,
      error_message: isUp ? null : `Expected status ${endpoint.expected_status}, got ${response.status}`,
    });
  } catch (err) {
    const responseTime = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Unknown error";

    await monitoringResultRepository.create({
      endpoint_id: endpoint.id,
      status: "down",
      status_code: null,
      response_time: responseTime,
      error_message: message,
    });
  }

  await recalculateStats(endpoint.id);
}
