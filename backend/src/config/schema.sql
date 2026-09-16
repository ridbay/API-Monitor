CREATE TABLE IF NOT EXISTS endpoints (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  expected_status INTEGER NOT NULL DEFAULT 200,
  timeout INTEGER NOT NULL DEFAULT 5000,
  interval TEXT NOT NULL DEFAULT '5m',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring_results (
  id SERIAL PRIMARY KEY,
  endpoint_id INTEGER NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('up', 'down')),
  status_code INTEGER,
  response_time INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_results_endpoint_id ON monitoring_results(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_results_created_at ON monitoring_results(created_at);

CREATE TABLE IF NOT EXISTS endpoint_statistics (
  id SERIAL PRIMARY KEY,
  endpoint_id INTEGER NOT NULL UNIQUE REFERENCES endpoints(id) ON DELETE CASCADE,
  availability NUMERIC(5, 2) NOT NULL DEFAULT 0,
  success_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  avg_response_time INTEGER NOT NULL DEFAULT 0,
  last_checked TIMESTAMPTZ
);
