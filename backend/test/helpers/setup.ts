// Import this before anything from src/. It runs before src/config/db.ts
// calls dotenv, and dotenv never overrides a variable that is already set, so
// the values below win over whatever is in backend/.env.

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5434/api_monitoring_test";

// Blank anything that would reach a real external system from a test.
for (const key of [
  "SERVICENOW_USER",
  "SERVICENOW_PASSWORD",
  "K8S_REMEDIATION_ENABLED",
  "K8S_API_URL",
  "K8S_TOKEN",
  "LOG_DISCOVERY_AUTO_PROMOTE",
  "GEMINI_API_KEY",
  "REDIS_URL",
]) {
  process.env[key] = "";
}

process.env.INCIDENT_FAILURE_THRESHOLD = "3";
process.env.INCIDENT_RECOVERY_THRESHOLD = "2";
