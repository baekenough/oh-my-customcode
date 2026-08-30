#!/usr/bin/env bash
# session-reflection.sh — Stop hook: transcript-based self-reflection for R007/R008 violations
# Phase 1 MVP: detects header absence (R007) and tool prefix absence (R008)
# Advisory-only: always exits 0, never blocks session end
#
# 환경변수 override (테스트/디버깅용):
#   OMCUSTOM_SESSION_REFLECTION=off  — 분석 완전 비활성화
#   OMCUSTOM_TRANSCRIPT_BASE        — transcript 디렉토리 경로 override
#   OMCUSTOM_PROJECT_ROOT           — 프로젝트 루트 override (.claude/outputs/reflections 기준)

set -euo pipefail

# ── Stop hook 프로토콜: stdin을 먼저 읽음 ──
input=$(cat)

# ── Opt-out 체크 ──
if [ "${OMCUSTOM_SESSION_REFLECTION:-}" = "off" ]; then
  printf '%s\n' "$input"
  exit 0
fi

# ── jq 의존성 체크 ──
if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' "$input"
  exit 0
fi

# ── session_id 추출 ──
session_id=$(printf '%s\n' "$input" | jq -r '.session_id // empty' 2>/dev/null)
if [ -z "$session_id" ]; then
  printf '%s\n' "$input"
  exit 0
fi

# ── Phase 2 (#1196): background_tasks / session_crons 추출 (CC v2.1.145+) ──
# 신규 필드 미존재 시 빈 배열로 처리 (graceful degrade).
bg_tasks_json=$(printf '%s\n' "$input" | jq -c '.background_tasks // []' 2>/dev/null || echo '[]')
session_crons_json=$(printf '%s\n' "$input" | jq -c '.session_crons // []' 2>/dev/null || echo '[]')
bg_tasks_count=$(printf '%s\n' "$bg_tasks_json" | jq 'length' 2>/dev/null || echo 0)
session_crons_count=$(printf '%s\n' "$session_crons_json" | jq 'length' 2>/dev/null || echo 0)

# 미완료 백그라운드 태스크: running/pending/in_progress 상태 카운트
bg_dangling_count=$(printf '%s\n' "$bg_tasks_json" | jq '[.[] | select(.status == "running" or .status == "pending" or .status == "in_progress")] | length' 2>/dev/null || echo 0)

# ── 경로 결정 (환경변수 override 지원) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# transcript 기본 경로 (OMCUSTOM_TRANSCRIPT_BASE 로 override 가능)
TRANSCRIPT_BASE="${OMCUSTOM_TRANSCRIPT_BASE:-${HOME}/.claude/projects/-Users-sangyi-workspace-projects-oh-my-customcode}"
TRANSCRIPT_PATH="${TRANSCRIPT_BASE}/${session_id}.jsonl"

if [ ! -f "$TRANSCRIPT_PATH" ]; then
  printf '%s\n' "$input"
  exit 0
fi

# 프로젝트 루트 (OMCUSTOM_PROJECT_ROOT 로 override 가능)
PROJECT_ROOT="${OMCUSTOM_PROJECT_ROOT:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"

# ── 백그라운드 분석 스크립트를 임시 파일로 생성 ──
# nohup bash -c "..." 또는 heredoc 방식은 글로브 확장/shell escape/stdin 충돌 문제 발생.
# 임시 파일 방식은 이 문제를 완전히 회피한다.
WORKER_SCRIPT="/tmp/.claude-reflection-worker-${PPID}-$$.sh"

cat > "$WORKER_SCRIPT" <<'WORKER_EOF'
#!/usr/bin/env bash
# Background worker: transcript analysis for R007/R008 violations

set -euo pipefail

TRANSCRIPT_PATH="$1"
PROJECT_ROOT="$2"
SESSION_ID="$3"
SCRIPT_DIR="$4"
BG_TASKS_JSON="${5:-[]}"
SESSION_CRONS_JSON="${6:-[]}"
BG_DANGLING_COUNT="${7:-0}"

# 출력 디렉토리 준비
OUTPUT_DIR="${PROJECT_ROOT}/.claude/outputs/reflections"
mkdir -p "${OUTPUT_DIR}"

LOG_FILE="${OUTPUT_DIR}/$(date +%Y-%m-%d).md"
ISO8601="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# ── transcript 파싱 ──
#
# 스키마 주의 (MEASURED 2026-08-05, #1553): Claude Code JSONL 라인에는 최상위 `role`/`content`가
# 없다. 실제 경로는 `.message.role` / `.message.content`다. 종전 구현은 `.role`을 읽어 항상 빈 값을
# 얻었고, 그 결과 assistant 라인이 하나도 매칭되지 않아 이 분석기는 사실상 0계층 탐지였다.
#
# 그리고 content 블록은 라인당 1개다 — 한 assistant 턴이 여러 줄에 걸친다. 따라서 턴을 먼저
# 복원한 뒤 판정한다. 턴 경계는 "진짜 user 프롬프트"(문자열 content 또는 tool_result가 없는
# 배열)이며, tool_result user 라인은 경계가 아니다. `isSidechain: true`(서브에이전트 턴)은
# 제외한다. `thinking` 블록은 R008 접두사를 가질 수 없으므로 판정 전에 제거한다.
#
# R008 판정은 블록 인접성이 아니라 **턴 단위 개수 비교**다 (#1563 찐빠 #1). R008 원문은
# "For parallel calls: list ALL identifications BEFORE the tool calls." 즉 병렬 배치의 식별을
# 배치 앞에 모아 나열하라는 규칙이지, 매 tool_use 직전에 text 블록을 끼우라는 요구가 아니다.
# 인접성 판정은 R009가 MUST로 요구하는 병렬 배치 `[text, tool_use, tool_use]`에서 2번째 이후
# tool_use를 무조건 위반으로 집계했다. 새 판정: violations = max(0, tool_use 수 − announce 수).
# announce 인정 범위: `[agent][model] → Tool:` 라인(도구당 1개). `→ Target:`은 `→ Tool:`의
# 동반 라인이라 중복 계수 금지(도구당 2로 세어 누락을 놓침). R008 §"Parallel Spawn Prefix Rule"이
# 규정한 spawn 표기(`→ Spawning:` 헤더 + 에이전트당 `[N] type:model → desc` 라인, `→ Tool: Agent`
# 없음)도 포함 — 에이전트당 단위는 번호 라인이고, 번호 라인이 없을 때만(단일 spawn) 헤더를 1로 센다.
# 위반 샘플은 announce가 모자란 만큼 턴의 마지막 tool_use들을 보고한다(결손 개수 기준).
#
# 분모에서 제외하는 도구: `Skill` (#1569). R008 §"Tier-3 Interaction Tool Prefix" 표는 Skill을
# 명시 면제한다 — "Skill | NO separate R008 prefix — identified via R007 `claude → {skill-name}`
# integrated header instead". 즉 준수한 스킬 호출은 `┌─ Agent: claude → homework` 통합 헤더만
# 남기고 `→ Tool:` 라인을 쓰지 않으므로, Skill tool_use를 세면 규칙을 정확히 지킨 턴에
# `R008 접두사=1` 오탐이 찍힌다.
#
# 이 판정은 r007-r008-drift-advisor.sh와 공유된다 — 한쪽만 고치면 재오염된다.
#
# 성능: 줄마다 jq를 포크하던 구조를 jq 1회 포크로 교체.
JQ_REFLECT='
split("\n")
| map(select(length > 0) | (fromjson? // empty))
| map(select((.isSidechain // false) != true))
| [ foreach .[] as $l (0;
      (if ($l.message.role? == "user")
          and ( (($l.message.content | type) == "string")
                or (([ $l.message.content[]? | select(.type? == "tool_result") ] | length) == 0) )
       then . + 1 else . end);
      {g: ., l: $l}) ]
| map(select(.l.message.role? == "assistant"))
| group_by(.g)
| map({ blocks: [ .[].l.message.content[]? | select(.type? != "thinking") ] })
| . as $turns
| ($turns | length) as $total
| [ range(0; $total)
    | . as $ti
    | ($turns[$ti].blocks) as $blocks
    | ([ $blocks[] | select(.type? == "text") ][0].text? // "") as $ftext
    | (($ftext | split("\n") | .[0]) // "") as $fline
    | ( if ($ftext | length) > 0
           and ((($fline | test("^┌─ Agent:")) or ($fline | test("^\\[.+\\]"))) | not)
        then [ {k: "R007", turn: ($ti + 1), s: ($fline[0:120])} ]
        else [] end )
      + ( ([ $blocks[] | select(.type? == "text") | (.text? // "") ] | join("\n") | split("\n")) as $lines
          | ([ $lines[] | select(test("\\[.+\\]\\[.+\\] ?(→|->|—>) ?Tool:")) ] | length) as $an_tool
          | ([ $lines[] | select(test("^[[:space:]]*\\[[0-9]+\\][[:space:]].*(→|->|—>)")) ] | length) as $an_spawn_item
          | ([ $lines[] | select(test("\\[.+\\]\\[.+\\] ?(→|->|—>) ?Spawning:")) ] | length) as $an_spawn_hdr
          | ($an_tool + (if $an_spawn_item > 0 then $an_spawn_item else $an_spawn_hdr end)) as $announce
          | ([ $blocks[] | select((.type? == "tool_use") and ((.name? // "") != "Skill")) ]) as $tus
          | (if ($tus | length) > $announce then ($tus | length) - $announce else 0 end) as $r008n
          | if $r008n > 0
            then [ $tus[(($tus | length) - $r008n):][]
                   | {k: "R008", turn: ($ti + 1), s: (.name? // "")} ]
            else [] end )
  ]
| flatten
| . as $viol
| ( [ ($total | tostring),
      ([ $viol[] | select(.k == "R007") ] | length | tostring),
      ([ $viol[] | select(.k == "R008") ] | length | tostring) ] | @tsv ),
  ( $viol[0:3][]
    | if .k == "R007" then "- [R007 turn \(.turn)]: \(.s)"
      else "- [R008 turn \(.turn)]: \(.s), missing prefix" end )
'

analysis=$(jq -Rsr "$JQ_REFLECT" < "$TRANSCRIPT_PATH" 2>/dev/null) || analysis=""

counts_line=$(printf '%s\n' "$analysis" | head -1)
total_turns=$(printf '%s' "$counts_line" | cut -f1)
r007_violations=$(printf '%s' "$counts_line" | cut -f2)
r008_violations=$(printf '%s' "$counts_line" | cut -f3)
sample_lines=$(printf '%s\n' "$analysis" | tail -n +2)

[ -n "$total_turns" ] || total_turns=0
[ -n "$r007_violations" ] || r007_violations=0
[ -n "$r008_violations" ] || r008_violations=0

if [ -n "$sample_lines" ]; then
  sample_count=$(printf '%s\n' "$sample_lines" | grep -c . || true)
else
  sample_count=0
fi

# ── Phase 2 (#1196): background_tasks / session_crons 분석 ──
bg_total=$(printf '%s\n' "$BG_TASKS_JSON" | jq 'length' 2>/dev/null || echo 0)
cron_total=$(printf '%s\n' "$SESSION_CRONS_JSON" | jq 'length' 2>/dev/null || echo 0)
bg_dangling_lines=""
cron_lines=""

if [ "$bg_total" -gt 0 ]; then
  # dangling 태스크 목록 (최대 5개): id + status + description (60자 truncate)
  bg_dangling_lines=$(printf '%s\n' "$BG_TASKS_JSON" | jq -r '
    [.[] | select(.status == "running" or .status == "pending" or .status == "in_progress")]
    | .[0:5]
    | map("  - id=\(.id // "?") status=\(.status // "?") desc=\((.description // "") | .[0:60])")
    | join("\n")
  ' 2>/dev/null || echo "")
fi

if [ "$cron_total" -gt 0 ]; then
  cron_lines=$(printf '%s\n' "$SESSION_CRONS_JSON" | jq -r '
    .[0:5]
    | map("  - id=\(.id // "?") schedule=\(.schedule // "?") prompt=\((.prompt // "") | .[0:60])")
    | join("\n")
  ' 2>/dev/null || echo "")
fi

# ── 로그 작성 ──
{
  echo ""
  echo "## Session ${SESSION_ID} — ${ISO8601}"
  echo ""
  echo "- **R007 violations**: ${r007_violations}"
  echo "- **R008 violations**: ${r008_violations}"
  echo "- Total assistant turns analyzed: ${total_turns}"
  echo "- **Background tasks (#1196)**: total=${bg_total}, dangling=${BG_DANGLING_COUNT}"
  echo "- **Session crons (#1196)**: total=${cron_total}"
  if [ $sample_count -gt 0 ]; then
    echo ""
    echo "### Sample violations (최대 3개)"
    printf '%s\n' "${sample_lines}"
  fi
  if [ -n "$bg_dangling_lines" ]; then
    echo ""
    echo "### Dangling background tasks (최대 5개)"
    printf '%s\n' "${bg_dangling_lines}"
  fi
  if [ -n "$cron_lines" ]; then
    echo ""
    echo "### Session crons (최대 5개)"
    printf '%s\n' "${cron_lines}"
  fi
} >> "${LOG_FILE}"

echo "[session-reflection] Analysis complete: R007=${r007_violations} R008=${r008_violations} turns=${total_turns} bg_dangling=${BG_DANGLING_COUNT} crons=${cron_total}" >&2
WORKER_EOF

chmod +x "$WORKER_SCRIPT"

# ── 백그라운드로 실행 (Stop hook 시간 예산 <3s 준수) ──
# setsid로 부모 종료 후에도 실행 지속; 완료 후 임시 파일 자정리
WORKER_ERR_LOG="/tmp/.claude-reflection-err-${PPID}.log"

(
  bash "$WORKER_SCRIPT" \
    "$TRANSCRIPT_PATH" \
    "$PROJECT_ROOT" \
    "$session_id" \
    "$SCRIPT_DIR" \
    "$bg_tasks_json" \
    "$session_crons_json" \
    "$bg_dangling_count" \
    2>>"$WORKER_ERR_LOG"
  rm -f "$WORKER_SCRIPT"
) &
disown $! 2>/dev/null || true

# ── 즉시 stdin pass-through 후 exit 0 (Stop hook 체인 유지) ──
printf '%s\n' "$input"
exit 0
