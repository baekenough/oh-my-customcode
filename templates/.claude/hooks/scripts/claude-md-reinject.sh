#!/usr/bin/env bash
# claude-md-reinject.sh — SessionStart: re-inject project CLAUDE.md into model context (#1617)
#
# 배경:
#   장기 세션에서 compact 이후 프로젝트 CLAUDE.md(강제 규칙 원문)가 모델 컨텍스트에서 유실되면
#   규칙 amnesia가 재발한다. 기존 PostCompact 훅(hooks.json)은 "prompt" 타입으로 요약 지침만
#   재주입할 뿐, CLAUDE.md 원문 전체를 재주입하지 않는다.
#
# 배선 이벤트 (Phase 1 판단, #1617):
#   R006 실측 기준(이 저장소 rules/MUST-agent-design.md) additionalContext 지원 이벤트 목록에
#   SessionStart는 있고 PostCompact는 없다. 한편 공식 문서(hooks.md, 2026-08-29 재확인)의
#   SessionStart matcher는 startup / resume / clear / compact 네 가지이며, "compact"는
#   auto/manual compact 직후를 가리킨다 — 즉 "session start 전체와 compact 재개 이후 재주입"
#   요구사항은 SessionStart 단일 이벤트(matcher "*")로 전부 커버된다. 별도 PostCompact 배선은
#   불필요 — 공식 문서 이벤트 목록(### 헤더 스캔)에 PostCompact 자체가 없다(PreCompact만 존재).
#
# 동작:
#   stdin JSON의 .source(startup/resume/clear/compact/기타)를 로그 헤더에 포함해
#   hookSpecificOutput.additionalContext로 CLAUDE.md 전체를 재주입한다.
#
# Opt-out: OMCUSTOM_CLAUDEMD_REINJECT=off (기본 on — 이 훅은 R021 advisory-first이되 기본 활성).
# Graceful degradation (R021): CLAUDE.md 부재 / jq 부재 / 초과 크기 → 무음 exit 0. 절대 exit 2 금지.

input=$(cat 2>/dev/null || echo '{}')

if [ "${OMCUSTOM_CLAUDEMD_REINJECT:-on}" = "off" ]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

source_field=$(printf '%s' "$input" | jq -r '.source // "unknown"' 2>/dev/null) || source_field="unknown"

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CLAUDE_MD="$PROJECT_ROOT/CLAUDE.md"

if [ ! -f "$CLAUDE_MD" ]; then
  exit 0
fi

# 크기 가드 — 훅 출력 폭주로 세션을 wedge시키는 실패 클래스 방지 (R021).
MAX_BYTES=${OMCUSTOM_CLAUDEMD_REINJECT_MAX_BYTES:-102400}
file_size=$(wc -c < "$CLAUDE_MD" 2>/dev/null | tr -d ' ') || file_size=0
if [ -z "$file_size" ] || [ "$file_size" -gt "$MAX_BYTES" ] 2>/dev/null; then
  exit 0
fi

claude_md_content=$(cat "$CLAUDE_MD" 2>/dev/null) || exit 0
if [ -z "$claude_md_content" ]; then
  exit 0
fi

header="[claude-md-reinject] CLAUDE.md re-injection (source: ${source_field})"

# 사람이 보는 감사 추적용 (SessionStart의 stdout 자체가 컨텍스트로 들어가므로, 사람용 로그는
# stderr로만 남긴다 — additionalContext 본문에는 섞지 않는다).
printf '%s\n' "$header" >&2

jq -cn --arg header "$header" --arg body "$claude_md_content" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: ($header + "\n\n" + $body)}}' \
  2>/dev/null || exit 0

exit 0
