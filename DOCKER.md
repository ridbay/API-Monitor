# Docker Commands

Run these from the repo root (`/Users/ridbay/Desktop/assignment`), where `docker-compose.yml` lives.

## Services
- **frontend** (`http://localhost:5173`): Nginx serving the React production bundle and reverse-proxying `/api/` to the backend.
- **backend** (`http://localhost:4001`): Express API and background synthetic check scheduler with automatic database migrations on startup.
- **postgres** (`localhost:5434`): PostgreSQL 15 database storing endpoints, monitoring results, and statistics.
- **redis** (`localhost:6379`): Redis cache for dashboard summaries.

## Lifecycle

```bash
docker compose up -d          # start all 4 services (postgres, redis, backend, frontend)
docker compose up -d --build  # rebuild and restart after source code changes
docker compose ps             # check status of all containers
docker compose down           # stop + remove containers (data volume survives)
docker compose restart        # restart all containers
docker compose logs -f        # tail all logs (Ctrl-C to exit)
docker compose logs -f backend
docker compose logs -f frontend
```

## Inspecting the database directly

### Option 1: Interactive Terminal Shell (Recommended & Quickest)

```bash
docker compose exec postgres psql -U postgres -d api_monitoring
```

Common commands once inside `psql`:
- `\dt` — list all tables
- `\d endpoints` — inspect table columns and types
- `SELECT * FROM endpoints;` — query all endpoints
- `SELECT * FROM monitoring_results ORDER BY created_at DESC LIMIT 10;` — view latest check results
- `\q` — exit psql

### Option 2: Run One-Off Commands from Host Terminal

```bash
docker compose exec postgres psql -U postgres -d api_monitoring -c "\dt"
docker compose exec postgres psql -U postgres -d api_monitoring -c "SELECT * FROM endpoints;"
docker compose exec postgres psql -U postgres -d api_monitoring -c "SELECT * FROM monitoring_results ORDER BY created_at DESC LIMIT 10;"
```

### Option 3: GUI Database Tools (TablePlus, DBeaver, Postico, DataGrip)

- **Host**: `localhost` or `127.0.0.1`
- **Port**: `5434` *(mapped to 5434 on host)*
- **User**: `postgres`
- **Password**: `postgres`
- **Database**: `api_monitoring`
- **URL**: `postgres://postgres:postgres@localhost:5434/api_monitoring`

## Inspecting Redis

```bash
docker compose exec redis redis-cli
docker compose exec redis redis-cli KEYS '*'
docker compose exec redis redis-cli GET dashboard:summary   # the cached dashboard payload
```

## Resetting data (destructive)

```bash
docker compose down -v        # drops the postgres_data volume too — wipes all endpoints/history
docker compose up -d
cd backend && npm run migrate # recreate tables on the fresh volume
```

## Troubleshooting

```bash
# What's actually listening on a port, if something conflicts
lsof -nP -iTCP:5432 -sTCP:LISTEN
lsof -nP -iTCP:4000 -sTCP:LISTEN

# If the backend suddenly 500s with ECONNREFUSED — Docker Desktop can
# silently restart and kill these containers without bringing them back:
docker compose ps
docker compose up -d          # bring them back; volume data is untouched

# Orphan-container warning from an old compose run in this same dir:
docker compose up -d --remove-orphans
```

## Notes for this project

- Postgres is mapped to host port **5434** (not the default 5432) — a native Homebrew Postgres service was already using 5432 on this machine. `backend/.env`'s `DATABASE_URL` points at `5434` accordingly.
- Redis is used for a 30-second cache of the `/api/dashboard/summary` response.
