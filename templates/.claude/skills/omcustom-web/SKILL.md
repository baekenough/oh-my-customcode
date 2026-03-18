---
name: omcustom:web
description: Control and inspect the built-in Web UI (packages/serve) — start, stop, status, open
scope: harness
argument-hint: "[start|stop|status|open]"
user-invocable: true
---

# Web UI Control

Interactive control for the built-in Web UI server (packages/serve).

## Arguments

| Argument | Action |
|----------|--------|
| `status` (default) | Show server status (PID, port, URL) |
| `start` | Start the Web UI server in background |
| `stop` | Stop the running Web UI server |
| `open` | Open the Web UI in the default browser |

## Workflow

### Step 1: Check Server Status

Run these checks via Bash:

```bash
PORT=${OMCUSTOM_PORT:-4321}
PID_FILE="$HOME/.omcustom-serve.pid"
PID=$(cat "$PID_FILE" 2>/dev/null)

# Process alive?
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  STATUS="running"
else
  STATUS="stopped"
  # Clean stale PID file
  [ -f "$PID_FILE" ] && rm "$PID_FILE"
fi

# Port check
PORT_PID=$(lsof -ti :$PORT 2>/dev/null | head -1)

echo "STATUS=$STATUS PID=$PID PORT=$PORT PORT_PID=$PORT_PID"
```

### Step 2: Display Status

```
Web UI Control
─────────────
Status: ● Running (PID {PID})
URL:    http://localhost:{PORT}
Log:    ~/.omcustom-serve.log
```

or

```
Web UI Control
─────────────
Status: ○ Stopped
Port:   {PORT} (free)
```

### Step 3: Execute Subcommand

| Subcommand | Action |
|------------|--------|
| `status` | Display status from Step 2, then exit |
| `start` | If stopped → run `omcustom serve` via Bash. If running → show URL |
| `stop` | If running → run `omcustom serve-stop` via Bash. If stopped → inform user |
| `open` | If running → `open http://localhost:{PORT}` (macOS). If stopped → ask to start first |

### Step 4: Port Conflict Detection

Before `start`, check if port is already occupied by another process:

```bash
PORT_PID=$(lsof -ti :$PORT 2>/dev/null | head -1)
if [ -n "$PORT_PID" ]; then
  PROC=$(ps -p $PORT_PID -o comm= 2>/dev/null)
  echo "Port $PORT is occupied by $PROC (PID $PORT_PID)"
fi
```

If occupied by a non-serve process, warn the user and suggest `--port` option.

## No Argument Behavior

When called without arguments (`/omcustom:web`):
1. Show status
2. If stopped, suggest: "Run `/omcustom:web start` to start the server"
3. If running, suggest: "Run `/omcustom:web open` to open in browser"
