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

-- Phase 2: Enterprise Incidents
CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  endpoint_id INTEGER REFERENCES endpoints(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('TRIGGERED', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'CLOSED')) DEFAULT 'TRIGGERED',
  root_cause TEXT,
  root_cause_category TEXT,
  affected_pods TEXT[],
  servicenow_sys_id TEXT,
  servicenow_ticket_num TEXT,
  servicenow_status TEXT,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  mitigated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_incidents_reference ON incidents(reference);

CREATE TABLE IF NOT EXISTS incident_timeline (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'SYSTEM',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident_id ON incident_timeline(incident_id);

-- Phase 2: Multi-Channel Notifications
CREATE TABLE IF NOT EXISTS notification_configs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'SERVICENOW', 'SLACK', 'TEAMS')),
  destination TEXT NOT NULL,
  min_severity TEXT NOT NULL DEFAULT 'P3' CHECK (min_severity IN ('P1', 'P2', 'P3', 'P4')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'SERVICENOW', 'SLACK', 'TEAMS')),
  recipient TEXT NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED', 'QUEUED')) DEFAULT 'SENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_incident_id ON notification_logs(incident_id);

-- Phase 4: Root Cause Analysis reports (latest per incident is authoritative)
CREATE TABLE IF NOT EXISTS rca_reports (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  diagnosis_category TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rca_reports_incident_id ON rca_reports(incident_id, created_at DESC);
