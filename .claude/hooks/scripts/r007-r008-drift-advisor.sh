#!/usr/bin/env bash
# r007-r008-drift-advisor.sh — UserPromptSubmit hook: PROACTIVE R007/R008 drift advisory (#1229)
#
# Inspects the LAST completed assistant turn in the session transcript for R007/R008
# compliance BEFORE Claude responds. If the previous turn drifted (missing identification
# header / tool prefix), emits a stderr advisory so the upcoming response self-corrects.
#
# This is the PROACTIVE complement to the retroactive session-reflection.sh (Stop hook, #1190).
# Detection patterns are reused from session-reflection.sh.
#
# Advisory-only: ALWAYS exits 0, ALWAYS passes stdin through to stdout, NEVER blocks.
# Performance: parses ONLY the last assistant turn (not the whole transcript).
#
# 환경변수 override (테스트/디버깅용):
#   OMCUSTOM_R007_ADVISOR=off  — advisory 완전 비활성화 (pass-through)
#   OMCUSTOM_TRANSCRIPT_BASE   — transcript 디렉토리 경로 override

set -euo pipefail

# ── UserPromptSubmit 프로토콜: stdin을 먼저 읽음 ──
input=$(cat)

# ── Opt-out 체크 ──
if [ "${OMCUSTOM_R007_ADVISOR:-}" = "off" ]; then
  echo "$input"
  exit 0
fi

# ── jq 의존성 체크 ──
if ! command -v jq >/dev/null 2>&1; then
  echo "$input"
  exit 0
fi

# ── session_id 추출 ──
session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null)
if [ -z "$session_id" ]; then
  echo "$input"
  exit 0
fi

# ── 경로 결정 (환경변수 override 지원) ──
TRANSCRIPT_BASE="${OMCUSTOM_TRANSCRIPT_BASE:-${HOME}/.claude/projects/-Users-sangyi-workspace-projects-oh-my-customcode}"
TRANSCRIPT_PATH="${TRANSCRIPT_BASE}/${session_id}.jsonl"

if [ ! -f "$TRANSCRIPT_PATH" ]; then
  echo "$input"
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
  echo "$input"
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

# ── advisory 출력 (위반 시에만) ──
if [ "$r007_violations" -gt 0 ] || [ "$r008_violations" -gt 0 ]; then
  printf '[R007/R008 Advisory] 직전 응답에서 식별 누락 감지 (R007 헤더=%d, R008 접두사=%d). 이번 응답은 ┌─ Agent: 헤더로 시작하고, 모든 도구 호출에 [agent][model] → Tool: 접두사를 포함하십시오.\n' \
    "$r007_violations" "$r008_violations" >&2
fi

# ── 항상 stdin pass-through 후 exit 0 (advisory는 절대 차단 금지) ──
echo "$input"
exit 0
