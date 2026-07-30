#!/usr/bin/env bash
# r007-r008-drift-advisor.sh — PROACTIVE R007/R008 drift advisory (#1229, #1545, #1547)
#
# Wired to TWO trigger points:
#   1. UserPromptSubmit — fires before Claude responds to a user-typed prompt (#1229).
#   2. SubagentStop — fires when a background subagent (Agent tool) completes, covering
#      autonomous-loop re-entry (e.g. /fsd) where the orchestrator resumes WITHOUT a
#      UserPromptSubmit event. Prior to #1545, autonomous-loop re-entry had zero R007/R008
#      advisory coverage since UserPromptSubmit never fires in that path.
#
# Inspects the LAST completed assistant turn in the session transcript for R007/R008
# compliance BEFORE Claude responds. If the previous turn drifted (missing identification
# header / tool prefix), delivers an advisory so the upcoming response self-corrects.
#
# This is the PROACTIVE complement to the retroactive session-reflection.sh (Stop hook, #1190).
# Detection patterns are reused from session-reflection.sh.
#
# Advisory-only: ALWAYS exits 0, NEVER blocks.
# Performance: parses ONLY the last assistant turn (not the whole transcript).
# Input-schema note: session_id/transcript_path are COMMON fields present on both
# UserPromptSubmit and SubagentStop hook payloads, so the detection logic below is
# event-agnostic and required no functional changes for the SubagentStop wiring.
#
# Delivery mechanism (#1547 fix):
#   Prior to this fix, the advisory was written to stderr with exit 0. Per the official
#   Claude Code hook spec, stderr on exit 0 is NEVER fed into the model's context for ANY
#   hook event (it is only visible in transcript debug mode, i.e. to a human, not Claude) —
#   so #1545's SubagentStop wiring never actually reached the model despite firing correctly.
#   The confirmed non-blocking delivery path for BOTH UserPromptSubmit and SubagentStop is
#   `hookSpecificOutput.additionalContext` in JSON stdout with exit 0:
#     {"hookSpecificOutput": {"hookEventName": "<event>", "additionalContext": "<text>"}}
#   This is NOT the same as `"decision": "block"` — that would force Stop/SubagentStop to
#   block (refuse to stop), which is exactly the blocking behavior R021 (advisory-first
#   enforcement) forbids for this hook. additionalContext alone (no `decision` field) is
#   non-blocking: Claude is allowed to stop/continue normally and simply sees the extra
#   context on its next turn. Exit code MUST stay 0 — exit 2 causes Claude Code to discard
#   any JSON output and treat stderr as a blocking error instead (see Common JSON Fields /
#   Exit Code Behavior in the official hook reference).
#   The stderr line is kept for human-visible audit trail (harmless on exit 0) but is no
#   longer the delivery mechanism.
#
# 환경변수 override (테스트/디버깅용):
#   OMCUSTOM_R007_ADVISOR=off  — advisory 완전 비활성화 (pass-through)
#   OMCUSTOM_TRANSCRIPT_BASE   — transcript 디렉토리 경로 override

set -euo pipefail

# ── stdin 읽기 ──
input=$(cat)

# ── Opt-out 체크 ──
if [ "${OMCUSTOM_R007_ADVISOR:-}" = "off" ]; then
  exit 0
fi

# ── jq 의존성 체크 ──
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

# ── session_id 추출 ──
session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null)
if [ -z "$session_id" ]; then
  exit 0
fi

# ── hook_event_name 추출 (hookSpecificOutput.hookEventName에 되돌려줄 값) ──
hook_event_name=$(echo "$input" | jq -r '.hook_event_name // empty' 2>/dev/null)
if [ -z "$hook_event_name" ]; then
  hook_event_name="UserPromptSubmit"
fi

# ── 경로 결정 (환경변수 override 지원) ──
TRANSCRIPT_BASE="${OMCUSTOM_TRANSCRIPT_BASE:-${HOME}/.claude/projects/-Users-sangyi-workspace-projects-oh-my-customcode}"
TRANSCRIPT_PATH="${TRANSCRIPT_BASE}/${session_id}.jsonl"

if [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# ── 마지막 assistant 메시지 추출 (성능: 전체 transcript 스캔 회피) ──
# 파일을 역순으로 읽으며 첫 번째 role=="assistant" 라인을 찾는다.
last_assistant=""
while IFS= read -r line; do
  role=$(echo "$line" | jq -r '.role // empty' 2>/dev/null) || continue
  if [ "$role" = "assistant" ]; then
    last_assistant="$line"
    break
  fi
done < <(tail -r "$TRANSCRIPT_PATH" 2>/dev/null || tac "$TRANSCRIPT_PATH" 2>/dev/null)

if [ -z "$last_assistant" ]; then
  exit 0
fi

# ── content 배열 파싱 ──
content_raw=$(echo "$last_assistant" | jq -c '.content // []' 2>/dev/null) || content_raw="[]"

r007_violations=0
r008_violations=0

# ── R007: 첫 번째 text 블록의 첫 줄 체크 ──
first_text=$(echo "$content_raw" | jq -r '[.[] | select(.type == "text")][0].text // empty' 2>/dev/null) || first_text=""
if [ -n "$first_text" ]; then
  first_line=$(printf '%s' "$first_text" | head -1)
  # R007 패턴: '┌─ Agent:' 또는 '[anything]' 단축 형태
  if ! printf '%s' "$first_line" | grep -qE '(^┌─ Agent:|^\[.+\])'; then
    r007_violations=$((r007_violations + 1))
  fi
fi

# ── R008: tool_use 블록 직전 text에 prefix 체크 ──
content_length=$(echo "$content_raw" | jq 'length' 2>/dev/null) || content_length=0
i=0
while [ "$i" -lt "$content_length" ]; do
  block_type=$(echo "$content_raw" | jq -r ".[$i].type // empty" 2>/dev/null) || { i=$((i+1)); continue; }

  if [ "$block_type" = "tool_use" ]; then
    has_prefix=false
    if [ "$i" -gt 0 ]; then
      prev_type=$(echo "$content_raw" | jq -r ".[$(( i - 1 ))].type // empty" 2>/dev/null) || true
      if [ "$prev_type" = "text" ]; then
        prev_text=$(echo "$content_raw" | jq -r ".[$(( i - 1 ))].text // empty" 2>/dev/null) || true
        # R008 패턴: '[agent-name][model] → Tool:' 또는 '→ Target:'
        if printf '%s' "$prev_text" | grep -qE '\[.+\]\[.+\] ?(→|->|—>) ?(Tool|Target):'; then
          has_prefix=true
        fi
      fi
    fi
    if [ "$has_prefix" = "false" ]; then
      r008_violations=$((r008_violations + 1))
    fi
  fi

  i=$((i+1))
done

# ── advisory 전달 (위반 시에만) ──
if [ "$r007_violations" -gt 0 ] || [ "$r008_violations" -gt 0 ]; then
  advisory_text=$(printf '[R007/R008 Advisory] 직전 응답에서 식별 누락 감지 (R007 헤더=%d, R008 접두사=%d). 이번 응답은 ┌─ Agent: 헤더로 시작하고, 모든 도구 호출에 [agent][model] → Tool: 접두사를 포함하십시오.' \
    "$r007_violations" "$r008_violations")

  # 사람이 보는 감사 추적용 (exit 0에서는 모델에 전달되지 않음 — #1547 참고)
  printf '%s\n' "$advisory_text" >&2

  # #1547 fix: hookSpecificOutput.additionalContext로 모델 컨텍스트에 실제 전달.
  # decision 필드는 절대 포함하지 않는다 — "block"을 쓰면 Stop/SubagentStop 정지를
  # 강제로 막아버려 advisory-only 원칙(R021)을 위반하게 된다. exit code는 반드시 0.
  jq -cn --arg event "$hook_event_name" --arg ctx "$advisory_text" \
    '{hookSpecificOutput: {hookEventName: $event, additionalContext: $ctx}}'
fi

# ── 위반이 없으면 아무것도 출력하지 않는다 (오탐 방지) ──
# ── 항상 exit 0 (advisory는 절대 차단 금지) ──
exit 0
