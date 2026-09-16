import { pool } from "../config/db";
import { Endpoint, HttpMethod, MonitoringInterval } from "../types";

export interface CreateEndpointInput {
  name: string;
  url: string;
  method: HttpMethod;
  expected_status: number;
  timeout: number;
  interval: MonitoringInterval;
}

export type UpdateEndpointInput = Partial<CreateEndpointInput>;

export interface EndpointWithStats extends Endpoint {
  status: "up" | "down" | "unknown";
  last_checked: string | null;
  availability: number;
  avg_response_time: number;
}

const BASE_SELECT = `SELECT * FROM endpoints WHERE deleted_at IS NULL`;

const WITH_STATS_SELECT = `
  SELECT
    e.*,
    COALESCE(s.availability, 0) AS availability,
    COALESCE(s.avg_response_time, 0) AS avg_response_time,
    s.last_checked,
    COALESCE(
      (SELECT mr.status FROM monitoring_results mr
       WHERE mr.endpoint_id = e.id ORDER BY mr.created_at DESC LIMIT 1),
      'unknown'
    ) AS status
  FROM endpoints e
  LEFT JOIN endpoint_statistics s ON s.endpoint_id = e.id
  WHERE e.deleted_at IS NULL
`;

export const endpointRepository = {
  async findAll(): Promise<Endpoint[]> {
    const result = await pool.query(`${BASE_SELECT} ORDER BY created_at DESC`);
    return result.rows;
  },

  async findActive(): Promise<Endpoint[]> {
    const result = await pool.query(`${BASE_SELECT} AND is_active = TRUE`);
    return result.rows;
  },

  async findById(id: number): Promise<Endpoint | null> {
    const result = await pool.query(`${BASE_SELECT} AND id = $1`, [id]);
    return result.rows[0] ?? null;
  },

  async findByIdWithStats(id: number): Promise<EndpointWithStats | null> {
    const result = await pool.query(`${WITH_STATS_SELECT} AND e.id = $1`, [id]);
    return result.rows[0] ?? null;
  },

  async findAllWithStats(): Promise<EndpointWithStats[]> {
    const result = await pool.query(`${WITH_STATS_SELECT} ORDER BY e.created_at DESC`);
    return result.rows;
  },

  async create(input: CreateEndpointInput): Promise<Endpoint> {
    const result = await pool.query(
      `INSERT INTO endpoints (name, url, method, expected_status, timeout, interval)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.name, input.url, input.method, input.expected_status, input.timeout, input.interval]
    );
    return result.rows[0];
  },

  async createMany(inputs: CreateEndpointInput[]): Promise<Endpoint[]> {
    if (inputs.length === 0) return [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created: Endpoint[] = [];
      for (const input of inputs) {
        const result = await client.query(
          `INSERT INTO endpoints (name, url, method, expected_status, timeout, interval)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [input.name, input.url, input.method, input.expected_status, input.timeout, input.interval]
        );
        created.push(result.rows[0]);
      }
      await client.query("COMMIT");
      return created;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async update(id: number, input: UpdateEndpointInput): Promise<Endpoint | null> {
    const fields = Object.keys(input) as (keyof UpdateEndpointInput)[];
    if (fields.length === 0) return this.findById(id);

    const setClauses = fields.map((field, i) => `${field} = $${i + 2}`);
    const values = fields.map((field) => input[field]);

    const result = await pool.query(
      `UPDATE endpoints SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, ...values]
    );
    return result.rows[0] ?? null;
  },

  async softDelete(id: number): Promise<boolean> {
    const result = await pool.query(
      `UPDATE endpoints SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },
};
