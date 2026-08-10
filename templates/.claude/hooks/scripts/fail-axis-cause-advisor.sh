#!/usr/bin/env bash
# fail-axis-cause-advisor.sh — UserPromptSubmit: 원인 없는 재촉 발화 감지 (FAIL 축)
#
# 배경:
#   8주 세션 실측에서 사용자 발화 216턴 중 원인 분석 표현이 0건(error_cause_ratio = 0.000)이었다.
#   반면 "계속해"(14) / "ㄱㄱ"(5) / "계속 진행해"(5) 등 원인 진술 없는 진행 지시가 24건,
#   전체 발화의 11%를 차지했다. 도구 실패가 세션당 1.72건 발생하는데도 원인을 묻지 않고
#   재촉으로 통과시키는 패턴이다.
#
# 역할:
#   (1) 짧은 진행 지시이고 (2) 원인 언급이 없으며 (3) 이 세션에 기록된 도구 실패가 있을 때,
#   Claude에게 "진행 전에 사용자에게 원인 가설 한 줄을 되물어라"는 advisory를 전달한다.
#
# 왜 사용자가 아니라 Claude에게 전달하는가:
#   hookSpecificOutput.additionalContext는 모델 컨텍스트로만 들어간다(사용자에게 표시되지 않음).
#   따라서 Claude가 사용자에게 되묻게 만들고, 사용자의 답변이 대화 로그에 사용자 발화로
#   남게 하는 우회 경로를 택한다. 이렇게 해야 실제 진단 행동과 계측 지표가 함께 개선된다.
#
# 왜 차단하지 않는가:
#   decision:"block"을 쓰면 프롬프트 자체가 거부되어 자율 루프(/fsd)가 멈춘다.
#   R021 advisory-first 원칙에 따라 절대 차단하지 않고 exit 0을 유지한다.
#
# 의존:
#   failure-ledger.sh(PostToolUseFailure)가 기록한 원장을 발동 조건으로 읽는다.
#   원장이 없으면 조용히 통과한다 — 훅 단독으로도 안전하게 동작한다.
#
# 환경변수 override:
#   OMCUSTOM_FAIL_ADVISOR=off     — advisory 완전 비활성화
#   OMCUSTOM_ERROR_LEDGER=<path>  — 원장 경로 override

set -euo pipefail

input=$(cat)

# ── Opt-out 체크 ──
if [ "${OMCUSTOM_FAIL_ADVISOR:-}" = "off" ]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

prompt=$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null) || exit 0
session=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null) || exit 0

if [ -z "$prompt" ] || [ -z "$session" ]; then
  exit 0
fi

# ── 조건 1: 짧은 발화만 대상 (긴 발화는 이미 맥락을 담고 있다고 본다) ──
# 실측 p75가 27자이므로 40자를 상한으로 둔다.
if [ "${#prompt}" -gt 40 ]; then
  exit 0
fi

# ── 조건 2: 진행/재촉 패턴인가 ──
if ! printf '%s' "$prompt" \
  | grep -qiE '(계속|이어서|진행해|재개|다음|ㄱㄱ|고고|가자|continue|keep going|go on|resume|proceed|next)'; then
  exit 0
fi

# ── 조건 3: 이미 원인/이유를 언급했다면 개입하지 않는다 (오탐 방지) ──
if printf '%s' "$prompt" \
  | grep -qiE '(원인|이유|왜|때문|에러|오류|error|fail|because|cause)'; then
  exit 0
fi

# ── 조건 4: 이 세션에 기록된 도구 실패가 있는가 ──
LEDGER="${OMCUSTOM_ERROR_LEDGER:-${HOME}/.claude/error-ledger.jsonl}"
if [ ! -f "$LEDGER" ]; then
  exit 0
fi

# 원장 꼬리만 스캔한다 (전체 파일 스캔 회피).
# interrupt == true 는 사용자가 직접 중단시킨 것이므로 진단 대상 실패가 아니다 — 제외한다.
# (제외하지 않으면 사용자가 스스로 끊은 도구까지 "원인을 대라"고 되묻는 오탐이 된다.)
fail_count=$(tail -n 300 "$LEDGER" 2>/dev/null \
  | jq -r --arg s "$session" 'select(.session == $s and .interrupt != true) | .tool' 2>/dev/null \
  | wc -l | tr -d ' ') || fail_count=0

if [ -z "$fail_count" ] || [ "$fail_count" -eq 0 ] 2>/dev/null; then
  exit 0
fi

# 최근 실패 도구 요약 (최대 3종)
fail_tools=$(tail -n 300 "$LEDGER" 2>/dev/null \
  | jq -r --arg s "$session" 'select(.session == $s and .interrupt != true) | .tool' 2>/dev/null \
  | sort | uniq -c | sort -rn | head -3 \
  | awk '{printf "%s(%s) ", $2, $1}') || fail_tools=""

advisory_text=$(printf '[FAIL Advisory] 이 세션에 도구 실패 %s건이 기록되어 있습니다 (%s). 방금 입력은 원인 언급이 없는 진행 지시입니다. 곧바로 재시도하지 말고, 먼저 직전 실패의 원인 가설을 한 줄로 제시한 뒤 사용자에게 "이 진단이 맞는지 / 다른 원인이 짚이는지" 짧게 한 번만 확인하십시오. 사용자가 답하면 그대로 진행합니다. 이 확인은 한 턴을 넘기지 마십시오.' \
  "$fail_count" "${fail_tools:-unknown}")

# 사람이 보는 감사 추적용 (exit 0에서 stderr는 모델에 전달되지 않음)
printf '%s\n' "$advisory_text" >&2

# 실제 전달 경로: additionalContext. decision 필드는 절대 포함하지 않는다.
jq -cn --arg ctx "$advisory_text" \
  '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $ctx}}'

exit 0
