# Docker Commands

Run these from the repo root (`/Users/ridbay/Desktop/assignment`), where `docker-compose.yml` lives.

## Lifecycle

```bash
docker compose up -d          # start postgres + redis in background
docker compose ps             # check status
docker compose down           # stop + remove containers (data volume survives)
docker compose restart        # restart both without recreating
docker compose logs -f postgres   # tail postgres logs (Ctrl-C to exit)
docker compose logs -f redis
```

## Inspecting the database directly

```bash
# psql shell inside the container
docker compose exec postgres psql -U postgres -d api_monitoring

# one-off query without an interactive shell
docker compose exec postgres psql -U postgres -d api_monitoring -c "SELECT * FROM endpoints;"
docker compose exec postgres psql -U postgres -d api_monitoring -c "SELECT * FROM monitoring_results ORDER BY created_at DESC LIMIT 10;"
```

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
