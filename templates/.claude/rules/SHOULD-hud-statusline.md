# [SHOULD] HUD Statusline Rules

> **Priority**: SHOULD | **ID**: R012

## Two-System Architecture

| Aspect | HUD Events | Statusline API |
|--------|-----------|----------------|
| Channel | stderr (hooks) | stdout (dedicated statusline) |
| Location | Inline in conversation log | Persistent bar at screen bottom |
| Trigger | PreToolUse (Agent/Task matcher) | Message update cycle (~300ms) |
| Role | Event notifications | Persistent session status |

## HUD Events (Hook-based)

Format: `─── [Spawn] {subagent_type}:{model} | {description} ───` — implemented in `.claude/hooks/hooks.json` (PreToolUse → Agent/Task matcher). Display for multi-step/parallel/long-running ops only.

> **v2.1.141+**: Hook JSON output can include `terminalSequence` field to emit window title changes or terminal bells without terminal control. Complementary to HUD stderr channel — e.g., update window title on task completion or ring bell after long parallel run. Modifying `.claude/hooks/` requires explicit user approval (R001).

> **v2.1.157+**: `tool_decision` telemetry events now include `tool_parameters` (bash commands, MCP/skill names) when `OTEL_LOG_TOOL_DETAILS=1`. Complements R012 observability — enables per-tool parameter tracking in monitoring dashboards. See `monitoring-setup` skill.

> **v2.1.161+**: `OTEL_RESOURCE_ATTRIBUTES` values are now emitted as labels on metric datapoints — usage metrics can be sliced by custom dimensions (e.g., team, repo). Extends R012 observability from per-tool parameters (v2.1.157) to per-dimension metric slicing; configure via the `monitoring-setup` skill's `OTEL_RESOURCE_ATTRIBUTES` env. Separately, `claude agents` rows now show `done/total` progress before the detail when work is fanned out, and peek surfaces the longest-running item — complements the HUD parallel-spawn display and R009 `[N]` correlation.

> **v2.1.174+**: The `/usage` (Account & usage) dialog now shows usage attribution — cache misses, long context, subagents, and per-skill/agent/plugin/MCP breakdowns over the last 24h or 7d (surfaced in the VSCode integration). Extends R012 observability from OTEL metric slicing (v2.1.161) to an interactive in-client attribution view — complements the `monitoring-setup` skill by giving per-skill/agent/plugin/MCP cost visibility without standing up an OTEL backend.

> **v2.1.176+**: Added the `footerLinksRegexes` setting — regex-matched link badges rendered in the footer row, configurable via user or managed settings. Relevant to R012 statusline composition: the footer can now surface contextual link badges alongside the `.claude/statusline.sh` segments. Also in v2.1.176, session titles are generated in the conversation's language (pin via the `language` setting).

> **v2.1.172+**: Added a `model` attribute to the `claude_code.lines_of_code.count` OTEL metric — lines-of-code telemetry can now be sliced by model. Extends the per-dimension metric slicing (v2.1.161) in the `monitoring-setup` skill.

> **v2.1.193+**: `claude_code.assistant_response` OpenTelemetry 로그 이벤트가 추가되어 모델의 응답 텍스트를 포함합니다. `OTEL_LOG_ASSISTANT_RESPONSES=1`이 아니면 redacted 되지만, 이 변수가 unset이면 `OTEL_LOG_USER_PROMPTS`를 따릅니다 — **보안 주의: 이미 프롬프트 내용을 로깅하는 배포는 업그레이드 즉시 응답 내용도 수신하기 시작합니다. 프롬프트만 유지하려면 `OTEL_LOG_ASSISTANT_RESPONSES=0`으로 설정하세요.** v2.1.157 tool_parameters / v2.1.161 metric slicing에 이은 `monitoring-setup` 스킬 OTEL 관측성 확장이며, 응답 텍스트 로깅은 명시적 opt-out이 필요한 민감 항목입니다.

> **v2.1.196+**: 여러 병렬 요청이 사용량 한도에 도달하는 순간 rate-limit 경고가 깜빡이며 꺼지고 rate-limit telemetry가 과다 집계되던 문제를 수정. R012 관측성의 rate-limit 계측 정확도 개선입니다.

<!-- DETAIL: HUD Events full spec
### When to Display: Multi-step tasks, parallel execution, long-running operations. Skip for single brief operations.
### Parallel Display:
─── [Agent] secretary | [Parallel] 4 ───
  [1] Agent(mgr-creator):sonnet → Create agent
  [2] Agent(lang-golang-expert):haiku → Code review
-->

## Statusline API (Command-based)

Format: `{Cost} | {project} | {branch} | RL:{rate_limit}% {countdown} | WL:{weekly_limit}% {countdown} | CTX:{usage}%`

Config in `.claude/settings.local.json`: `statusLine.type: "command"`, `statusLine.command: ".claude/statusline.sh"`. Requires CC v2.1.80+ for RL/WL segments. `refreshInterval` setting (v2.1.97+): Auto-refresh interval in seconds for the status line command. Set in `statusLine.refreshInterval` in settings.json.

<!-- DETAIL: Statusline configuration JSON and color coding
```json
{ "statusLine": { "type": "command", "command": ".claude/statusline.sh", "padding": 0 } }
```
Color coding: Cost (<$1 green, $1-4.99 yellow, >=5 red), RL/WL (<50% green, 50-79% yellow, >=80% red), CTX (<60% green, 60-79% yellow, >=80% red).
Countdown format: >=1d → "{d}d{h}h", >=1h → "{h}h{m}m", <1h → "{m}m", unavailable → omitted.
RL/WL segments omitted on CC older than v2.1.80.
-->

## Integration

Integrates with R007 (Agent ID), R008 (Tool ID), R009 (Parallel).

## External Plugin Statusline Conflict

| Plugin | Component | Resolution |
|--------|-----------|------------|
| cc-token-saver | Live Status Line | R012 `.claude/statusline.sh` has priority. Disable cc-token-saver statusline to avoid duplicate status bars. |

Internal statusline (`.claude/statusline.sh`) is the primary status display. External plugin status lines are supplementary or disabled.
