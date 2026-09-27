---
name: omcustom:monitoring-setup
description: Enable/disable OpenTelemetry console monitoring for Claude Code usage tracking
scope: package
argument-hint: "[enable|disable|status]"
user-invocable: true
---

# Monitoring Setup Skill

Enable or disable OpenTelemetry console monitoring. When enabled, Claude Code outputs usage metrics (cost, tokens, sessions, LOC, commits, PRs, active time) and events (tool results, API requests) to the terminal.

## Natural Language Triggers

This skill activates when the user mentions any of:
- Korean: "모니터링", "텔레메트리", "사용량 추적", "메트릭", "모니터링 켜줘", "텔레메트리 활성화"
- English: "monitoring", "telemetry", "usage tracking", "metrics", "enable monitoring"
- Combined with actions: "켜", "끄", "활성화", "비활성화", "설정", "enable", "disable", "setup"

## Commands

### CC 버전 분기 안내

Claude Code 2.1.282부터 project·local 설정 파일(`.claude/settings.json`, `.claude/settings.local.json`)에 적힌 OpenTelemetry 변수 중 export를 켜거나(마스터 스위치 `CLAUDE_CODE_ENABLE_TELEMETRY`), endpoint를 지정하거나, 내용을 캡처하는 변수(예: `OTEL_LOG_*`)는 무시됩니다. CHANGELOG는 이 마스터 스위치와 `OTEL_LOG_*`만 예시로 명명하며, `OTEL_METRICS_EXPORTER`·`OTEL_LOGS_EXPORTER` 자체가 무시 목록에 명시된 것은 아닙니다. 다만 마스터 스위치가 무시되면 project/local `env`의 텔레메트리 전송 자체가 꺼지므로, 이 두 exporter 변수를 그 자리에 남겨 두어도 결과적으로 무효화됩니다. 따라서 세 변수를 함께 user-scope 설정이나 셸 export로 옮기라는 권고는 그대로 유효합니다. 아래 각 명령은 실행 중인 Claude Code 버전(`claude --version`으로 확인)에 따라 두 갈래로 나뉩니다 — 2.1.282 미만은 기존 절차를 따르고, 2.1.282 이상은 user-scope 설정(`~/.claude/settings.json`) 또는 셸 `export`로 안내합니다.

**버전 비교 방법**: `claude --version` 출력에서 맨 앞의 `X.Y.Z` 버전 문자열을 추출합니다. `X`·`Y`·`Z`를 각각 정수로 변환해 `2`·`1`·`282`와 구성요소별로 수치 비교합니다. 문자열 사전식 비교는 사용하지 않습니다.

### enable (default)

**CC 버전 확인**: 먼저 `claude --version`으로 설치된 버전을 확인하고, 위 「CC 버전 분기 안내」의 버전 비교 방법으로 2.1.282 기준을 판정합니다.

#### 2.1.282 미만

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

#### 2.1.282 이상

project·local 설정에 적힌 OTel 변수는 무시되므로 `.claude/settings.local.json`을 쓰지 않습니다. 대신 아래 절차를 따릅니다.

1. 적용할 env 블록을 사용자에게 보여줍니다:
   ```json
   {
     "env": {
       "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
       "OTEL_METRICS_EXPORTER": "console",
       "OTEL_LOGS_EXPORTER": "console"
     }
   }
   ```
2. 두 가지 배치 옵션을 제시합니다:
   - **User-scope 설정**: `~/.claude/settings.json`의 `env` 필드에 위 블록을 추가
   - **셸 export**: `claude` 실행 전에 `export CLAUDE_CODE_ENABLE_TELEMETRY=1 OTEL_METRICS_EXPORTER=console OTEL_LOGS_EXPORTER=console`
3. 사용자가 이번 호출에서 명시적으로 승인한 경우에만 `~/.claude/settings.json`을 직접 씁니다 — 프로젝트 범위를 벗어난 파일이므로 사전 승인 없이는 쓰지 않습니다(R002).
4. 셸 export를 선택하면 파일을 쓰지 않고 위 명령을 사용자에게 그대로 전달합니다.
5. Report:
   ```
   [Done] OpenTelemetry Console Monitoring enabled (user scope)

   Configured in: ~/.claude/settings.json (or shell export, per user's choice)
   Metrics: sessions, cost, tokens, LOC, commits, PRs, active time
   Events: tool results, API requests, tool decisions

   Note: project/local settings.json no longer carry these variables on 2.1.282+.
   To disable: /monitoring-setup disable
   ```

### disable

**CC 버전 확인**: `claude --version`으로 설치된 버전을 확인하고, 위 「CC 버전 분기 안내」의 버전 비교 방법으로 2.1.282 기준을 판정합니다.

#### 2.1.282 미만

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

#### 2.1.282 이상

1. `.claude/settings.local.json`에 레거시 OTel 변수가 남아 있으면(마스터 스위치가 무시되어 전송 자체가 꺼지므로 결과적으로 무효하지만) 정리를 제안합니다.
2. 실제 활성화 지점인 user-scope 설정(`~/.claude/settings.json`)의 `env`에서 OTel 관련 키를 제거하도록 안내하거나, 사용자 승인 후 직접 제거합니다.
3. 셸 `export`로 설정한 경우 해당 셸 세션에서 `unset CLAUDE_CODE_ENABLE_TELEMETRY OTEL_METRICS_EXPORTER OTEL_LOGS_EXPORTER`를 안내합니다.
4. Report:
   ```
   [Done] OpenTelemetry Monitoring disabled

   Removed from: ~/.claude/settings.json (or unset in shell), plus any legacy .claude/settings.local.json entries
   Takes effect on next session restart.
   ```

### status

**CC 버전 확인**: `claude --version`으로 설치된 버전을 확인하고, 위 「CC 버전 분기 안내」의 버전 비교 방법으로 2.1.282 기준을 판정합니다.

#### 2.1.282 미만

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

#### 2.1.282 이상

1. `.claude/settings.local.json`과 project `.claude/settings.json`을 확인하되, 여기 적힌 OTel 변수는 무시된다는 점을 함께 보고합니다.
2. user-scope 설정(`~/.claude/settings.json`)의 `env`와 현재 셸 환경 변수를 확인해 실제 활성화 여부를 판단합니다.
3. 검증 보조 수단으로 `/status`와 `claude doctor`를 안내합니다 — 2.1.282부터 두 명령 모두 무시된 telemetry 변수 목록을 표시합니다.
4. Report:
   ```
   [Monitoring Status]
   ├── Enabled: Yes/No (source: user-scope settings / shell env)
   ├── Metrics exporter: console / otlp / none
   ├── Logs exporter: console / otlp / none
   ├── Ignored (project/local): list of any legacy OTel keys found
   └── Config: ~/.claude/settings.json or shell env (project/local settings.json is ignored on 2.1.282+)
   ```

## Implementation Notes

- `settings.local.json` is NOT git-tracked (local to user)
- Each user enables monitoring independently
- No infrastructure required for console mode
- Metrics appear in stderr during Claude Code execution
- Default export interval: 60s for metrics, 5s for events
- 2.1.282부터 project/local 설정의 OTel 변수는 무시되므로, 활성화 위치가 user-scope 설정 또는 셸 환경으로 이동합니다(위 enable 절 참고)

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
| `claude_code.assistant_response` | Assistant response text (v2.1.193+; redacted unless opted in) |

> **v2.1.193+ security note (R012)**: The `claude_code.assistant_response` log event carries the model's response text. It is redacted unless `OTEL_LOG_ASSISTANT_RESPONSES=1`; when that variable is unset it FOLLOWS `OTEL_LOG_USER_PROMPTS`. A deployment already logging prompt content therefore begins receiving response content immediately on upgrade. To keep prompts-only logging, set `OTEL_LOG_ASSISTANT_RESPONSES=0` explicitly.

## Upgrade Path

For production monitoring, upgrade from console to OTLP:

```bash
# In settings.local.json env:
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

## Advanced OTel Configuration

### Additional Metrics

| Metric | Description | Unit |
|--------|-------------|------|
| `code_edit_tool.decision` | Edit tool accept/reject decisions | count |

### Exporter Configuration

```json
{
  "env": {
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
    "OTEL_RESOURCE_ATTRIBUTES": "service.name=claude-code,service.version=2.1.197"
  }
}
```

### Cardinality Controls

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_LOG_TOOL_DETAILS` | Include tool input/output in logs | `false` |
| `OTEL_METRICS_INCLUDE_TOOL_NAME` | Include tool name dimension | `true` |
| `OTEL_METRICS_INCLUDE_MODEL` | Include model dimension | `true` |

### Multi-Exporter Syntax

```bash
# Send metrics to both console and OTLP
OTEL_METRICS_EXPORTER=console,otlp
OTEL_LOGS_EXPORTER=console,otlp
```

### Prometheus Exporter

```bash
OTEL_METRICS_EXPORTER=prometheus
OTEL_EXPORTER_PROMETHEUS_PORT=9464
```

## Data Privacy

Environment variables to control data collection and telemetry:

| Variable | Description |
|----------|-------------|
| `DISABLE_TELEMETRY` | Disable all telemetry collection |
| `DISABLE_ERROR_REPORTING` | Disable error reporting to Anthropic |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | Disable non-essential network traffic |
| `CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY` | Disable feedback survey prompts |
| `DO_NOT_TRACK` | Standard DNT signal |

### Enterprise Configuration

```json
{
  "env": {
    "DISABLE_TELEMETRY": "1",
    "DISABLE_ERROR_REPORTING": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

## HTTP-Level Inspection (Optional)

For deeper payload-level debugging beyond aggregated metrics, [Claude Inspector](https://github.com/kangraemin/claude-inspector) provides MITM proxy inspection of Claude Code HTTP traffic.

| Aspect | OTel Monitoring (this skill) | Claude Inspector |
|--------|------------------------------|-----------------|
| Layer | Application (hooks, stdout) | HTTP (MITM proxy) |
| Metrics | Aggregated (cost, tokens, duration) | Per-request payload breakdown |
| Cache visibility | Not available | Prompt Cache hit/miss rates |
| Sub-agent view | Summary via hooks | Full parent vs sub-agent context comparison |
| Setup | Built-in (hooks + statusline) | External tool (Homebrew on macOS) |

### When to Use

- **OTel monitoring**: Daily operations, cost tracking, performance trends
- **Claude Inspector**: Debugging specific payload issues, measuring CLAUDE.md token impact, verifying ecomode (R013) effectiveness, profiling sub-agent context inheritance

### Setup

```bash
# macOS
brew install kangraemin/tap/claude-inspector

# Run proxy
claude-inspector
```

Claude Inspector is external to oh-my-customcode and does not require any project configuration changes.

## Agent Trajectory Export Mode

Toggle: `/monitoring-setup trajectory-otel on|off`

When enabled, agent-eval-framework 4-metric data is emitted as OpenTelemetry spans for external analysis.

### trajectory-otel on

1. Read `.claude/settings.local.json` (create if not exists)
2. Add or update `env` field with trajectory export configuration:
   ```json
   {
     "env": {
       "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
       "OTEL_METRICS_EXPORTER": "console",
       "OTEL_LOGS_EXPORTER": "console",
       "CLAUDE_TRAJECTORY_OTEL": "1"
     }
   }
   ```
3. If `OTEL_EXPORTER_OTLP_ENDPOINT` is set in the environment, also add:
   ```json
   {
     "env": {
       "OTEL_TRACES_EXPORTER": "otlp"
     }
   }
   ```
   Otherwise default to `"OTEL_TRACES_EXPORTER": "console"`.
4. Preserve all existing settings
5. Report:
   ```
   [Done] Agent Trajectory Export enabled

   Configured in: .claude/settings.local.json
   Span exporter: console (default) | otlp (if OTEL_EXPORTER_OTLP_ENDPOINT set)
   Metrics: correctness, step_ratio, tool_call_ratio, latency_ratio
   Events: tool_call (tool_name, duration_ms, exit_code)

   Note: Takes effect on next `claude` session restart.
   To disable: /monitoring-setup trajectory-otel off
   ```

### trajectory-otel off

1. Read `.claude/settings.local.json`
2. Remove trajectory-related keys from `env`:
   - `CLAUDE_TRAJECTORY_OTEL`
   - `OTEL_TRACES_EXPORTER`
3. Report:
   ```
   [Done] Agent Trajectory Export disabled

   Removed from: .claude/settings.local.json
   Takes effect on next session restart.
   ```

### Span Schema

```
operation: agent.invocation
attributes:
  agent.type: string          // e.g. "lang-golang-expert"
  agent.model: string         // e.g. "claude-sonnet-4-6"
  task.id: string             // eval task identifier
  task.capability: string     // research | implement | review | debug | manage
  metric.correctness: bool
  metric.step_ratio: float
  metric.tool_call_ratio: float
  metric.latency_ratio: float
events:
  - tool_call
      attrs: tool_name (string), duration_ms (int), exit_code (int)
duration: total wall clock time of agent invocation
```

### Activation Notes

- Independent from the existing console monitoring mode (`enable`/`disable`). Both can be active simultaneously.
- `trajectory-otel on` does NOT implicitly call `enable` — console metrics monitoring remains a separate toggle.
- Console exporter (default): prints span JSON to stdout for local dev / debugging.
- OTLP exporter (optional): activated when `OTEL_EXPORTER_OTLP_ENDPOINT` env var is set. Compatible with Grafana, Datadog, Honeycomb, and any OTLP-compliant collector. No LangSmith dependency.
- Actual OTEL SDK emission is handled by the Claude Code telemetry layer. This skill configures the env vars that activate the trajectory span pipeline.
- 2.1.282부터 이 절의 `env` 설정도 project/local 범위에서 무시되므로, 위 enable/disable 절의 2.1.282 이상 분기와 동일하게(사용자 승인 후 user-scope 설정 또는 셸 export) 적용합니다

### status (extended)

When `trajectory-otel` is active, `status` command output includes:

```
[Monitoring Status]
├── Enabled: Yes/No
├── Metrics exporter: console / otlp / none
├── Logs exporter: console / otlp / none
├── Trajectory export: Yes/No
├── Traces exporter: console / otlp / none
└── Config: .claude/settings.local.json
```

