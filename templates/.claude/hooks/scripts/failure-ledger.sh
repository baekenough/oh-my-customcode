#!/usr/bin/env bash
# failure-ledger.sh — PostToolUseFailure 에러 원장 기록 (FAIL 축 계측)
#
# 배경:
#   hooks.json은 성공 경로(PreToolUse 12 / PostToolUse 16 / Stop 7)에는 촘촘히 배선되어
#   있으나 실패 경로에는 훅이 하나도 없었다. 그 결과 도구 실패가 세션당 평균 1.72건
#   발생함에도 아무 데이터도 남지 않아, R023 검증 래더의 상위 tier(에러 패턴 인식,
#   post-mortem)를 측정할 근거 자체가 없는 상태였다.
#
# 역할:
#   도구 호출 실패 시 한 줄 JSONL을 원장에 append 한다. 이 원장은
#   (1) recovery 성공률 산출, (2) 반복 실패 도구/명령 식별,
#   (3) fail-axis-cause-advisor.sh(UserPromptSubmit)의 발동 조건으로 쓰인다.
#
# 설계 원칙:
#   - 순수 append-only. 기존 파일을 읽거나 수정하지 않는다.
#   - 네트워크 호출 없음. 외부 명령은 jq/date만 사용.
#   - 어떤 실패에도 exit 0 — 원장 기록 실패가 본 작업을 막아서는 안 된다 (R021 advisory-first).
#   - 명령/에러 문자열은 절단하여 기록한다 (원장 비대화 방지).
#
# exit_code 필드 (#1834 / #1814 R2):
#   PostToolUseFailure에는 숫자 exit code 필드가 없고 `error` 문자열("Exit code 3")만 온다
#   (실측: CC 2.1.310, `claude -p`, haiku, 1회, `sh -c 'exit 3'`). 그래서 `^Exit code ([0-9]+)`
#   일 때만 정수를 파싱해 exit_code로 기록하고, 아니면 null이다.
#   기대 exit 화이트리스트는 두지 않는다 — 동기였던 `git grep` no-match(exit 1)는 같은
#   조건에서 PostToolUseFailure를 발생시키지 않고, returnCodeInterpretation "No matches found"를
#   가진 PostToolUse로만 도달했다(실측). `false`, 일반 `grep` 등 다른 exit-1 명령, 대화형 세션,
#   다른 모델/버전은 미측정이다.
#
# 환경변수 override:
#   OMCUSTOM_FAILURE_LEDGER=off   — 기록 완전 비활성화
#   OMCUSTOM_ERROR_LEDGER=<path>  — 원장 경로 override (기본: ~/.claude/error-ledger.jsonl)

set -euo pipefail

input=$(cat)

# ── Opt-out 체크 ──
if [ "${OMCUSTOM_FAILURE_LEDGER:-}" = "off" ]; then
  exit 0
fi

# ── jq 의존성 체크 (없으면 조용히 통과) ──
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

# HOME guard: with no override, skip when HOME is unset, empty or not absolute
# (otherwise `set -u` exits 1 on an unset HOME, or the ledger lands in a relative path).
if [ -z "${OMCUSTOM_ERROR_LEDGER:-}" ]; then
  case "${HOME:-}" in
    /*) ;;
    *) exit 0 ;;
  esac
fi
LEDGER="${OMCUSTOM_ERROR_LEDGER:-${HOME}/.claude/error-ledger.jsonl}"

if ! mkdir -p "$(dirname "$LEDGER")" 2>/dev/null; then
  exit 0
fi

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")

# ── 한 줄 JSONL append ──
# 에러 필드 위치 (공식 문서 실측, code.claude.com/docs/en/hooks "PostToolUseFailure input"):
#   PostToolUseFailure는 PostToolUse와 달리 tool_response를 보내지 않는다. 에러는
#   **최상위 `error`** 문자열로 오고, 부수적으로 `is_interrupt` / `duration_ms`가 따라온다.
#   초판이 `.tool_response.error`를 읽어 err가 항상 빈 문자열이 되던 결함을 교정한 것이다
#   (r007-r008-drift-advisor.sh의 `.role` vs `.message.role`과 동일 계열).
#   .tool_error / .tool_response.* fallback은 스키마 변화에 대한 방어로만 남긴다 —
#   tool_response가 문자열인 경우 인덱싱 에러로 레코드가 통째로 유실되므로 type 검사로 감싼다.
#   .tool_input도 같은 이유로 type 검사를 씌운다 (#1656 A 실측): 스칼라/배열 tool_input이
#   오면 jq가 인덱싱 에러로 죽고 `2>/dev/null || true` 때문에 **조용히 레코드 전체가
#   유실**됐다 — rc는 0이고 stderr도 비어 있어 크래시가 아니라 데이터 손실로 나타난다.
#
# 단일 라인(<1KB) append 이므로 O_APPEND 원자성에 기대어 병렬 에이전트 환경에서도 안전.
printf '%s' "$input" \
  | jq -c --arg ts "$ts" --arg cwd "$PWD" '
      {
        ts:      $ts,
        session: (.session_id // ""),
        cwd:     $cwd,
        tool:    (.tool_name // "unknown"),
        target:  ((if (.tool_input | type) == "object"
                    then (.tool_input.command // .tool_input.file_path // "")
                    else "" end) | tostring | .[0:160]),
        interrupt: (.is_interrupt == true),
        exit_code: ((.error | if type == "string" then (capture("^Exit code (?<c>[0-9]+)") | .c | tonumber) else null end) // null),
        err:     ((.error
                   // .tool_error
                   // (if (.tool_response | type) == "object"
                       then (.tool_response.error // .tool_response.stderr)
                       else .tool_response end)
                   // "")
                  | tostring | gsub("\\s+"; " ") | .[0:320])
      }' >> "$LEDGER" 2>/dev/null || true

exit 0
