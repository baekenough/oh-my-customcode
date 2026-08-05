#!/usr/bin/env bash
# r007-r008-drift-advisor.sh — PROACTIVE R007/R008 drift advisory (#1229, #1545, #1547, #1553)
#
# Wired to THREE trigger points:
#   1. UserPromptSubmit — fires before Claude responds to a user-typed prompt (#1229).
#   2. SubagentStop — fires when a background subagent (Agent tool) completes, covering
#      autonomous-loop re-entry (e.g. /fsd) where the orchestrator resumes WITHOUT a
#      UserPromptSubmit event. Prior to #1545, autonomous-loop re-entry had zero R007/R008
#      advisory coverage since UserPromptSubmit never fires in that path.
#   3. PostToolUse — fires after every tool call, covering the remaining structural gap
#      (#1553): an orchestrator-only stretch BEFORE the first subagent spawn satisfies
#      neither UserPromptSubmit (no user input) nor SubagentStop (no subagent yet).
#      Measured 2026-08-05: 7/8 responses in such a stretch had missing R007 headers with
#      zero advisory fires.
#
# Inspects the LAST completed assistant TURN in the session transcript for R007/R008
# compliance. If the turn drifted (missing identification header / tool prefix), delivers
# an advisory so the next response self-corrects.
#
# This is the PROACTIVE complement to the retroactive session-reflection.sh (Stop hook, #1190).
# Detection patterns are shared with session-reflection.sh.
#
# Advisory-only: ALWAYS exits 0, NEVER blocks.
#
# ── Transcript schema (MEASURED 2026-08-05, #1553) ────────────────────────────────────
# Claude Code JSONL lines do NOT carry a TOP-LEVEL `role`/`content`. The measured top-level
# key set is:
#   attributionSkill, cwd, effort, entrypoint, gitBranch, isSidechain, message, parentUuid,
#   requestId, sessionId, session_id, timestamp, type, userType, uuid, version
# The role lives at `.message.role` and the content blocks at `.message.content`.
# The previous implementation selected `.role` / `.content`, which ALWAYS evaluated to empty
# — so this advisor exited before ever reaching its detection logic and had NEVER fired
# (verified: 0 occurrences of `"additionalContext":` across 771 transcripts; a live probe
# produced 0 bytes on both stdout and stderr).
#
# Additional measured facts that shape this implementation:
#   * ONE content block per JSONL line (867 assistant lines across 3 sessions, 0 multi-block).
#     A single assistant TURN therefore spans MULTIPLE consecutive lines. Treating "the last
#     assistant line" as "the last turn" makes the R008 adjacency test (`i > 0`) permanently
#     false — every tool call would be reported as a violation. Turn reconstruction is a
#     PRECONDITION for the PostToolUse wiring, not an optimization.
#   * `isSidechain: true` marks subagent turns. They MUST be excluded or a subagent's turn
#     is misattributed to the orchestrator. (Note: jq's `//` treats `false` as empty, so the
#     filter is written as `(.isSidechain // false) != true`.)
#   * User lines are NOT all turn boundaries — tool results arrive as `.message.role == "user"`
#     with `tool_result` content blocks. Only a genuine prompt (string content, or an array
#     with no tool_result block) ends a turn.
#   * `thinking` blocks are interleaved with text/tool_use and never carry an R008 prefix;
#     they are filtered out before adjacency analysis.
#
# ── Performance ───────────────────────────────────────────────────────────────────────
# The previous implementation forked jq once PER LINE inside a `while read` loop (measured
# 2.80s and 8.64s on real transcripts). PostToolUse fires on EVERY tool call, so that cost
# would stall the session. This version reads a bounded `tail -n 200` window and forks jq
# exactly ONCE for the whole analysis.
#
# ── Dedup ─────────────────────────────────────────────────────────────────────────────
# PostToolUse fires repeatedly within a single turn. The turn's first assistant line `uuid`
# is recorded in a per-session marker file; the same turn never produces a second advisory.
# The marker is derived purely from transcript content (no `date`, no randomness) so the
# behavior is idempotent and testable.
#
# ── Delivery mechanism (#1547 fix) ────────────────────────────────────────────────────
#   Per the official Claude Code hook spec, stderr on exit 0 is NEVER fed into the model's
#   context for ANY hook event (it is only visible in transcript debug mode, i.e. to a human).
#   The confirmed non-blocking delivery path is `hookSpecificOutput.additionalContext` in
#   JSON stdout with exit 0:
#     {"hookSpecificOutput": {"hookEventName": "<event>", "additionalContext": "<text>"}}
#   `hookEventName` MUST echo the ACTUAL firing event — a wrong value invalidates the output,
#   so a missing `hook_event_name` field is a hard `exit 0` (no default is guessed).
#   This is NOT the same as `"decision": "block"` — that would force Stop/SubagentStop to
#   block, exactly the behavior R021 (advisory-first enforcement) forbids here. Exit code MUST
#   stay 0 — exit 2 causes Claude Code to discard JSON output and treat stderr as a blocking
#   error instead.
#   The stderr line is kept purely as a human-visible audit trail.
#
# 환경변수 override (테스트/디버깅용):
#   OMCUSTOM_R007_ADVISOR=off  — advisory 완전 비활성화 (pass-through)
#   OMCUSTOM_TRANSCRIPT_BASE   — transcript 디렉토리 경로 override (설정 시 최우선)
#   OMCUSTOM_R007_MARKER_DIR   — dedup 마커 디렉토리 override (기본 ${TMPDIR:-/tmp})

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

# ── 입력 필드 추출 (jq 1회 fork) ──
meta=$(printf '%s' "$input" | jq -r '[(.session_id // ""), (.hook_event_name // ""), (.transcript_path // "")] | @tsv' 2>/dev/null) || exit 0
session_id=$(printf '%s' "$meta" | cut -f1)
hook_event_name=$(printf '%s' "$meta" | cut -f2)
transcript_in=$(printf '%s' "$meta" | cut -f3)

if [ -z "$session_id" ]; then
  exit 0
fi

# hook_event_name이 없으면 hookSpecificOutput.hookEventName을 정확히 채울 수 없다.
# 잘못된 기본값은 출력을 무효화하므로 추측하지 않고 즉시 종료한다 (fallback 제거).
if [ -z "$hook_event_name" ]; then
  exit 0
fi

# ── transcript 경로 결정 ──
# 우선순위: 테스트 override > 훅 페이로드의 transcript_path > 기본 경로
if [ -n "${OMCUSTOM_TRANSCRIPT_BASE:-}" ]; then
  TRANSCRIPT_PATH="${OMCUSTOM_TRANSCRIPT_BASE}/${session_id}.jsonl"
elif [ -n "$transcript_in" ]; then
  TRANSCRIPT_PATH="$transcript_in"
else
  TRANSCRIPT_PATH="${HOME}/.claude/projects/-Users-sangyi-workspace-projects-oh-my-customcode/${session_id}.jsonl"
fi

if [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# ── 마지막 assistant 턴 재구성 + R007/R008 판정 (jq 1회 fork) ──
# 출력: "<turn-uuid>\t<r007-count>\t<r008-count>" (턴이 없으면 무출력)
JQ_LAST_TURN='
split("\n")
| map(select(length > 0) | (fromjson? // empty))
| map(select((.isSidechain // false) != true))
| . as $L
| ($L | length) as $n
| [ range(0; $n) | select($L[.].message.role? == "assistant") ] as $ai
| if ($ai | length) == 0 then empty
  else
    ($ai[-1]) as $last
    | [ range(0; $last + 1)
        | select( ($L[.].message.role? == "user")
                  and ( (($L[.].message.content | type) == "string")
                        or (([ $L[.].message.content[]? | select(.type? == "tool_result") ] | length) == 0) ) ) ] as $bi
    | (if ($bi | length) > 0 then $bi[-1] else -1 end) as $b
    | [ range($b + 1; $last + 1) | $L[.] | select(.message.role? == "assistant") ] as $turn
    | [ $turn[] | .message.content[]? | select(.type? != "thinking") ] as $blocks
    | ($turn[0].uuid? // "") as $tuuid
    | ([ $blocks[] | select(.type? == "text") ][0].text? // "") as $ftext
    | (($ftext | split("\n") | .[0]) // "") as $fline
    | (if ($ftext | length) == 0 then 0
       elif ($fline | test("^┌─ Agent:")) or ($fline | test("^\\[.+\\]")) then 0
       else 1 end) as $r007
    | ([ range(0; ($blocks | length))
         | select($blocks[.].type? == "tool_use")
         | select( (. == 0)
                   or ($blocks[. - 1].type? != "text")
                   or (((($blocks[. - 1].text?) // "") | test("\\[.+\\]\\[.+\\] ?(→|->|—>) ?(Tool|Target):")) | not) ) ] | length) as $r008
    | [$tuuid, ($r007 | tostring), ($r008 | tostring)] | @tsv
  end
'

result=$(tail -n 200 "$TRANSCRIPT_PATH" 2>/dev/null | jq -Rsr "$JQ_LAST_TURN" 2>/dev/null) || result=""

if [ -z "$result" ]; then
  exit 0
fi

turn_uuid=$(printf '%s' "$result" | cut -f1)
r007_violations=$(printf '%s' "$result" | cut -f2)
r008_violations=$(printf '%s' "$result" | cut -f3)

: "${r007_violations:=0}"
: "${r008_violations:=0}"

# ── 위반이 없으면 아무것도 출력하지 않는다 (오탐 방지) ──
if [ "$r007_violations" -eq 0 ] && [ "$r008_violations" -eq 0 ]; then
  exit 0
fi

# ── dedup: 같은 턴에 대해 두 번 발화하지 않는다 ──
# 마커 키는 transcript 내용(턴의 첫 assistant uuid)에서만 파생 — date/랜덤 사용 금지.
MARKER_DIR="${OMCUSTOM_R007_MARKER_DIR:-${TMPDIR:-/tmp}}"
marker_key=$(printf '%s' "$session_id" | tr -c 'A-Za-z0-9._-' '_')
MARKER_FILE="${MARKER_DIR}/.omcustom-r007-advisor-${marker_key}"

if [ -n "$turn_uuid" ] && [ -f "$MARKER_FILE" ]; then
  prev_uuid=$(cat "$MARKER_FILE" 2>/dev/null || printf '')
  if [ "$prev_uuid" = "$turn_uuid" ]; then
    exit 0
  fi
fi

advisory_text=$(printf '[R007/R008 Advisory] 직전 응답에서 식별 누락 감지 (R007 헤더=%s, R008 접두사=%s). 이번 응답은 ┌─ Agent: 헤더로 시작하고, 모든 도구 호출에 [agent][model] → Tool: 접두사를 포함하십시오.' \
  "$r007_violations" "$r008_violations")

# 사람이 보는 감사 추적용 (exit 0에서는 모델에 전달되지 않음 — #1547 참고)
printf '%s\n' "$advisory_text" >&2

# #1547 fix: hookSpecificOutput.additionalContext로 모델 컨텍스트에 실제 전달.
# decision 필드는 절대 포함하지 않는다 — "block"을 쓰면 Stop/SubagentStop 정지를
# 강제로 막아버려 advisory-only 원칙(R021)을 위반하게 된다. exit code는 반드시 0.
jq -cn --arg event "$hook_event_name" --arg ctx "$advisory_text" \
  '{hookSpecificOutput: {hookEventName: $event, additionalContext: $ctx}}'

if [ -n "$turn_uuid" ]; then
  printf '%s' "$turn_uuid" > "$MARKER_FILE" 2>/dev/null || true
fi

# ── 항상 exit 0 (advisory는 절대 차단 금지) ──
exit 0
