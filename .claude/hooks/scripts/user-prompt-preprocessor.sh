#!/usr/bin/env bash
# user-prompt-preprocessor.sh — UserPromptSubmit hook: advisory hints from the user's prompt
#
# Advisory-only: ALWAYS exits 0, NEVER blocks prompt submission.
#
# ── Two measured defects this file fixes (#1568) ──────────────────────────────────────
#
# 1. SELECTOR. The previous implementation read `.user_input`, but the Claude Code
#    UserPromptSubmit payload carries the text in `prompt`. The `[ -z "$user_input" ]` guard
#    on the next line therefore ALWAYS took the early-return branch, so the detection blocks
#    below were unreachable — the hook was a pure pass-through.
#    Live probe (2026-08-10):
#      platform-shaped {"prompt":"끝"}     → NO hint (defect)
#      script-shaped   {"user_input":"끝"} → "[Hook] Session-end signal detected"
#    `.prompt` is now read first, with `.user_input` retained as a fallback so any
#    script-shaped caller (and the pre-existing test corpus) keeps working.
#
# 2. DELIVERY CHANNEL. The hints were written to stderr only. Per the official hook spec,
#    stderr on exit 0 is NEVER fed into the model's context for ANY event — it is visible in
#    transcript debug mode, i.e. to a human, not to Claude. Fixing the selector alone would
#    have left the hook functionally silent. Hints are now delivered through
#    `hookSpecificOutput.additionalContext` (JSON on stdout, exit 0), the same contract used
#    by the sibling UserPromptSubmit advisors r007-r008-drift-advisor.sh and
#    fail-axis-cause-advisor.sh. The stderr line is kept purely as a human audit trail.
#
#    `hookEventName` MUST echo the ACTUAL firing event — a wrong value invalidates the
#    output — so a missing `hook_event_name` is a hard `exit 0` with no guessed default.
#    A top-level `decision` field is NEVER emitted: `"decision": "block"` would turn this
#    advisory into an enforcement gate, exactly what R021 (advisory-first) forbids.
#
# ── Why the stdin pass-through (`echo "$input"`) was removed ──────────────────────────
# It was never part of the UserPromptSubmit contract. For UserPromptSubmit, plain stdout on
# exit 0 is injected into the model's context, so echoing the payload back would inject the
# raw hook JSON as context noise. The repo's own convention agrees: of the four scripts wired
# to UserPromptSubmit in .claude/hooks/hooks.json, the three that were written or repaired
# against the measured spec — r007-r008-drift-advisor.sh, session-autofix-prompt.sh,
# fail-axis-cause-advisor.sh — all exit 0 WITHOUT echoing stdin. This file was the only
# hold-out. Pass-through echo is a Stop-hook idiom (see session-reflection.sh, which chains),
# not a UserPromptSubmit one.

set -euo pipefail

# ── stdin 읽기 ──
input=$(cat)

# ── jq 의존성 체크 (graceful degrade) ──
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

# ── 입력 필드 추출 ──
# `.prompt`(플랫폼 실제 필드)를 우선 읽고 `.user_input`(스크립트형 호출자)로 폴백한다.
# prompt 본문은 탭/개행을 포함할 수 있으므로 @tsv 로 묶지 않고 개별 추출한다.
user_input=$(printf '%s' "$input" | jq -r '(.prompt // .user_input // "")' 2>/dev/null) || exit 0
hook_event_name=$(printf '%s' "$input" | jq -r '(.hook_event_name // "")' 2>/dev/null) || exit 0

if [ -z "$user_input" ]; then
  exit 0
fi

# ── 패턴 탐지 ──
hints=""

# Korean session-end signals
if printf '%s' "$user_input" | grep -qiE '(끝|종료|마무리|done|wrap up|end session)'; then
  hints="${hints}[Hook] Session-end signal detected — R011 memory saves will be triggered"$'\n'
fi

# Workflow invocation
if printf '%s\n' "$user_input" | grep -qE '^/'; then
  hints="${hints}[Hook] Slash command detected"$'\n'
fi

if [ -z "$hints" ]; then
  exit 0
fi

# 사람이 보는 감사 추적용 (exit 0에서는 모델에 전달되지 않음 — 위 주석 2번 참고)
printf '%s' "$hints" >&2

# hook_event_name 이 없으면 hookSpecificOutput.hookEventName 을 정확히 채울 수 없다.
# 잘못된 기본값은 출력을 무효화하므로 추측하지 않는다.
if [ -z "$hook_event_name" ]; then
  exit 0
fi

# 실제 전달 경로: additionalContext. decision 필드는 절대 포함하지 않는다 (R021).
jq -cn --arg event "$hook_event_name" --arg ctx "$hints" \
  '{hookSpecificOutput: {hookEventName: $event, additionalContext: $ctx}}'

exit 0
