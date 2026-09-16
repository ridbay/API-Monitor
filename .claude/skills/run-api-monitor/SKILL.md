---
name: run-api-monitor
description: Build, run, and drive the API Monitoring Platform (Express/Postgres/Redis backend + React/Vite frontend). Use when asked to start the app, run the backend or frontend dev servers, take a screenshot of the dashboard/endpoints/import/reports UI, or interact with the running app end-to-end.
---

Full-stack app: Express+TypeScript API (backend/) + Postgres/Redis (Docker)
+ React/Vite frontend (frontend/). For agent/automated use, drive the UI via
the Playwright REPL at `.claude/skills/run-api-monitor/driver.mjs` — plain
`chromium-cli` isn't installed in this environment, so this wraps Playwright
directly with the same command vocabulary.

All paths below are relative to the repo root.

## Prerequisites

Docker (for Postgres + Redis) and Node/npm. On this machine both were
already present; nothing extra needed:

```bash
docker info >/dev/null && echo ok   # Docker daemon must be running
node -v && npm -v
```

If tmux isn't installed (needed for the agent-path wrapping below):

```bash
brew install tmux        # macOS
# or: apt-get install -y tmux   # Linux
```

## Setup

```bash
docker compose up -d                 # postgres + redis
cd backend && npm install && npm run migrate
cd ../frontend && npm install
cd ../.claude/skills/run-api-monitor && npm install   # playwright, for the driver
```

**Ports are non-default** — 5432 and 4000 were both already taken by
other things on this machine (a native Homebrew Postgres service and an
unrelated Docker container, respectively), so:

| Service | Port | Notes |
|---|---|---|
| Backend API | `4001` | set in `backend/.env` (`PORT=4001`) |
| Frontend (Vite) | `5173` | Vite default; proxies `/api` → `localhost:4001` |
| Postgres | `5434` → container `5432` | see `docker-compose.yml` + `backend/.env` `DATABASE_URL` |
| Redis | `6379` | default |

If `backend/.env` doesn't exist yet: `cp backend/.env.example backend/.env`
(it already has the correct `5434`/`4001` values baked in).

## Build

No separate build step for local/agent use — both sides run in dev mode
(`tsx watch` for the backend, Vite dev server for the frontend). Type-check
without emitting, as a quick correctness check:

```bash
cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit -p tsconfig.app.json
```

## Run (agent path)

Start the app in the background and wait for both to be ready:

```bash
cd backend && npm run dev &> /tmp/backend.log &
cd frontend && npm run dev &> /tmp/frontend.log &
for i in {1..30}; do curl -sf http://localhost:4001/health >/dev/null && break; sleep 1; done
for i in {1..30}; do curl -sf http://localhost:5173/ >/dev/null && break; sleep 1; done
curl http://localhost:4001/health   # -> {"status":"ok"}
```

Then drive the UI via the Playwright REPL, wrapped in tmux (poll for output
markers rather than fixed sleeps — the pattern below works):

```bash
tmux new-session -d -s app -x 200 -y 50
tmux send-keys -t app 'cd .claude/skills/run-api-monitor && node driver.mjs' Enter
for i in {1..20}; do tmux capture-pane -t app -p | grep -q "driver>" && break; sleep 0.5; done
tmux send-keys -t app 'launch' Enter
for i in {1..40}; do tmux capture-pane -t app -p | grep -q "launched\." && break; sleep 0.5; done
tmux send-keys -t app 'nav /' Enter
for i in {1..30}; do tmux capture-pane -t app -p | tail -3 | grep -q "nav ->" && break; sleep 0.5; done
tmux send-keys -t app 'wait text=Total Endpoints' Enter   # NOT "text=Dashboard" - see Gotchas
for i in {1..20}; do tmux capture-pane -t app -p | tail -3 | grep -qE "found:|TIMEOUT:" && break; sleep 0.5; done
tmux send-keys -t app 'ss dashboard' Enter
for i in {1..20}; do tmux capture-pane -t app -p | tail -3 | grep -q "screenshot:" && break; sleep 0.5; done
tmux capture-pane -t app -p
```

Screenshots land in `/tmp/shots/` (override: `SCREENSHOT_DIR`). Base URL
defaults to `http://localhost:5173` (override: `BASE_URL`).

### Commands

| command | what it does |
|---|---|
| `launch` | start headless Chromium + a page |
| `nav <path>` | go to `<BASE_URL><path>` (or a full URL); waits for network idle |
| `wait <selector>` | wait up to 10s for a selector (`text=...`, CSS, etc.) |
| `ss [name]` | screenshot → `/tmp/shots/<name>.png` |
| `click <css-sel>` | click an element |
| `click-text <text>` | click a button/link/element containing this text |
| `fill <css-sel> <text>` | fill an input (rest of the line is the value) |
| `upload <css-sel> <file>` | set a file input, e.g. `upload #csv-file ./test.csv` |
| `text [css-sel]` | print `innerText` (body if no selector) |
| `eval <js>` | evaluate an expression in the page, print JSON |
| `console` | print captured browser console errors since the last `nav` |
| `quit` | close the browser |
| `help` | list commands |

A full verified round-trip (add an endpoint through the real form):

```
nav /endpoints/new
fill #name Driver Test Endpoint
fill #url https://example.com/health
click-text Save Endpoint
wait text=Endpoints
ss after-save
```

## Run (human path)

```bash
cd backend && npm run dev    # http://localhost:4001
cd frontend && npm run dev   # http://localhost:5173 - open in a browser
```
Ctrl-C each to stop.

## Gotchas

- **Playwright's browser subprocess breaks readline on `process.stdin`.**
  `launch` would hang forever with zero output/error if the driver read
  `process.stdin` directly. Fix (already in `driver.mjs`): open `/dev/stdin`
  as its own fd via `fs.createReadStream(null, { fd: fs.openSync(...) })`,
  same trick the Electron driver pattern uses for the same reason.

- **Piped/heredoc stdin fires readline's `"close"` almost immediately** —
  right after all lines are read, *not* after the queued async commands
  finish running. A naive `rl.on("close", () => process.exit(0))` will kill
  an in-flight `launch` before `chromium.launch()` even resolves. Fixed by
  queuing every command on a single promise chain and awaiting that same
  chain in the `"close"` handler before exiting. (Doesn't affect real tmux
  `send-keys` usage — a live pty doesn't EOF between commands — but it's
  what makes non-interactive heredoc testing of the driver itself possible.)

- **`wait text=Dashboard` is not a readiness signal** — that text is in the
  sidebar nav link and page heading and appears instantly, before the
  `/api/dashboard/summary` fetch resolves. `page.goto(..., {waitUntil:
  "networkidle"})` is already satisfied before React Query's own fetch even
  starts. Wait for something that only renders after data loads instead,
  e.g. `text=Total Endpoints` (a summary card label).

- **Never screenshot Recharts pages with `{ fullPage: true }`.** This app's
  charts use Recharts' `ResponsiveContainer` (ResizeObserver-driven). A
  full-page screenshot resizes/stitches the viewport, which races the
  chart's resize-triggered relayout — pies and bars come out completely
  blank even though the DOM has the correct, fully-opaque paths. A plain
  viewport screenshot (`page.screenshot({ path })`, no `fullPage`) doesn't
  have this problem; the driver's `ss` command already omits it. If you
  need below-the-fold content, scroll first instead of using `fullPage`.

- **Postgres/Redis containers can silently die if Docker Desktop itself
  restarts** (observed mid-session here — unrelated containers from another
  project came back up automatically, ours didn't, despite `restart:
  unless-stopped`). Symptom: backend logs show `ECONNREFUSED ...:5434`,
  `/api/*` returns 500. Fix: `docker compose up -d` again — the Postgres
  data volume persists, no need to re-run `npm run migrate`.

- **Ports 5432 and 4000 are likely already taken on a dev machine** — a
  native Postgres service and some unrelated Docker container claimed them
  here. `backend/.env` and `docker-compose.yml` already use `5434`/`4001`
  instead; don't "fix" them back to the defaults.

## Troubleshooting

- **`role "postgres" does not exist` connecting to Postgres**: you hit a
  *different*, already-running Postgres on port 5432 (e.g. a native
  Homebrew service), not this project's container. Confirm with
  `lsof -nP -iTCP:5432 -sTCP:LISTEN`; use the container's own port (`5434`
  here) instead.
- **`EADDRINUSE :::4000` starting the backend**: something else already
  owns 4000 (check `lsof -nP -iTCP:4000 -sTCP:LISTEN`). Use `PORT=4001` (or
  whatever's free) in `backend/.env`.
- **`/api/*` returns `{"error":"Internal server error"}`**: check
  `/tmp/backend.log` — almost always `ECONNREFUSED` to Postgres/Redis, i.e.
  the Docker containers aren't running. `docker compose up -d`.
- **`chromium.launch()` hangs with no output at all**: this was a real bug
  in an earlier version of `driver.mjs` (see Gotchas — stdin interference).
  If it recurs, verify the raw-fd stdin read and the `"close"`-awaits-queue
  fix are both still in place.
