---
name: monitoring-setup
description: Enable/disable OpenTelemetry console monitoring for Claude Code usage tracking
argument-hint: "[enable|disable|status]"
---

# Monitoring Setup Skill

Enable or disable OpenTelemetry console monitoring. When enabled, Claude Code outputs usage metrics (cost, tokens, sessions, LOC, commits, PRs, active time) and events (tool results, API requests) to the terminal.

## Natural Language Triggers

This skill activates when the user mentions any of:
- Korean: "모니터링", "텔레메트리", "사용량 추적", "메트릭", "모니터링 켜줘", "텔레메트리 활성화"
- English: "monitoring", "telemetry", "usage tracking", "metrics", "enable monitoring"
- Combined with actions: "켜", "끄", "활성화", "비활성화", "설정", "enable", "disable", "setup"

## Commands

### enable (default)

1. Read `.claude/settings.local.json` (create if not exists)
2. Add or update `env` field with:
   ```json
   {
     "env": {
       "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
       "OTEL_METRICS_EXPORTER": "console",
       "OTEL_LOGS_EXPORTER": "console"
     }
   }
   ```
3. Preserve all existing settings
4. Report to user:
   ```
   [Done] OpenTelemetry Console Monitoring enabled

   Configured in: .claude/settings.local.json
   Metrics: sessions, cost, tokens, LOC, commits, PRs, active time
   Events: tool results, API requests, tool decisions

   Note: Takes effect on next `claude` session restart.
   To disable: /monitoring-setup disable
   ```

### disable

1. Read `.claude/settings.local.json`
2. Remove OTel-related keys from `env`:
   - `CLAUDE_CODE_ENABLE_TELEMETRY`
   - `OTEL_METRICS_EXPORTER`
   - `OTEL_LOGS_EXPORTER`
3. If `env` object becomes empty, remove `env` field entirely
4. Report:
   ```
   [Done] OpenTelemetry Monitoring disabled

   Removed from: .claude/settings.local.json
   Takes effect on next session restart.
   ```

### status

1. Read `.claude/settings.local.json`
2. Check for OTel env vars
3. Report current state:
   ```
   [Monitoring Status]
   ├── Enabled: Yes/No
   ├── Metrics exporter: console / otlp / none
   ├── Logs exporter: console / otlp / none
   └── Config: .claude/settings.local.json
   ```

## Implementation Notes

- `settings.local.json` is NOT git-tracked (local to user)
- Each user enables monitoring independently
- No infrastructure required for console mode
- Metrics appear in stderr during Claude Code execution
- Default export interval: 60s for metrics, 5s for events

## Available Metrics

| Metric | Description | Unit |
|--------|-------------|------|
| `claude_code.session.count` | CLI sessions started | count |
| `claude_code.cost.usage` | Session cost | USD |
| `claude_code.token.usage` | Tokens used (input/output/cache) | tokens |
| `claude_code.lines_of_code.count` | Code lines modified (added/removed) | count |
| `claude_code.commit.count` | Git commits created | count |
| `claude_code.pull_request.count` | Pull requests created | count |
| `claude_code.active_time.total` | Active usage time | seconds |

## Available Events

| Event | Description |
|-------|-------------|
| `claude_code.tool_result` | Tool execution results with duration |
| `claude_code.api_request` | API request details with cost/tokens |
| `claude_code.api_error` | API error details |
| `claude_code.tool_decision` | Tool accept/reject decisions |
| `claude_code.user_prompt` | User prompt metadata (content redacted by default) |

## Upgrade Path

For production monitoring, upgrade from console to OTLP:

```bash
# In settings.local.json env:
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```
