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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# transcript 기본 경로 (OMCUSTOM_TRANSCRIPT_BASE 로 override 가능)
TRANSCRIPT_BASE="${OMCUSTOM_TRANSCRIPT_BASE:-${HOME}/.claude/projects/-Users-sangyi-workspace-projects-oh-my-customcode}"
TRANSCRIPT_PATH="${TRANSCRIPT_BASE}/${session_id}.jsonl"

if [ ! -f "$TRANSCRIPT_PATH" ]; then
  echo "$input"
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

# 출력 디렉토리 준비
OUTPUT_DIR="${PROJECT_ROOT}/.claude/outputs/reflections"
mkdir -p "${OUTPUT_DIR}"

LOG_FILE="${OUTPUT_DIR}/$(date +%Y-%m-%d).md"
ISO8601="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# ── transcript 파싱 ──
r007_violations=0
r008_violations=0
total_turns=0
sample_count=0
sample_lines=""

while IFS= read -r line; do
  role=$(echo "$line" | jq -r '.role // empty' 2>/dev/null) || continue
  [ "$role" = "assistant" ] || continue

  total_turns=$((total_turns + 1))
  turn_idx=$total_turns

  # content 배열 파싱
  content_raw=$(echo "$line" | jq -c '.content // []' 2>/dev/null) || continue

  # ── R007: 첫 번째 text 블록의 첫 줄 체크 ──
  first_text=$(echo "$content_raw" | jq -r '[.[] | select(.type == "text")][0].text // empty' 2>/dev/null) || true
  if [ -n "$first_text" ]; then
    first_line=$(printf '%s' "$first_text" | head -1)
    # R007 패턴: '┌─ Agent:' 또는 '[anything]' 단축 형태
    if ! printf '%s' "$first_line" | grep -qE '(^┌─ Agent:|^\[.+\])'; then
      r007_violations=$((r007_violations + 1))
      if [ $sample_count -lt 3 ]; then
        # 120자 truncate (secret-filter.sh는 PostToolUse용이라 여기서는 단순 truncate)
        safe_text=$(printf '%s' "$first_line" | head -c 120)
        sample_lines="${sample_lines}
- [R007 turn ${turn_idx}]: ${safe_text}"
        sample_count=$((sample_count + 1))
      fi
    fi
  fi

  # ── R008: tool_use 블록 직전 text에 prefix 체크 ──
  content_length=$(echo "$content_raw" | jq 'length' 2>/dev/null) || continue

  i=0
  while [ $i -lt "$content_length" ]; do
    block_type=$(echo "$content_raw" | jq -r ".[$i].type // empty" 2>/dev/null) || { i=$((i+1)); continue; }

    if [ "$block_type" = "tool_use" ]; then
      tool_name=$(echo "$content_raw" | jq -r ".[$i].name // empty" 2>/dev/null) || true

      # 직전 블록이 text이고 R008 prefix를 포함하는지 체크
      has_prefix=false
      if [ $i -gt 0 ]; then
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
        if [ $sample_count -lt 3 ]; then
          sample_lines="${sample_lines}
- [R008 turn ${turn_idx}]: ${tool_name}, missing prefix"
          sample_count=$((sample_count + 1))
        fi
      fi
    fi

    i=$((i+1))
  done

done < "$TRANSCRIPT_PATH"

# ── 로그 작성 ──
{
  echo ""
  echo "## Session ${SESSION_ID} — ${ISO8601}"
  echo ""
  echo "- **R007 violations**: ${r007_violations}"
  echo "- **R008 violations**: ${r008_violations}"
  echo "- Total assistant turns analyzed: ${total_turns}"
  if [ $sample_count -gt 0 ]; then
    echo ""
    echo "### Sample violations (최대 3개)"
    printf '%s\n' "${sample_lines}"
  fi
} >> "${LOG_FILE}"

echo "[session-reflection] Analysis complete: R007=${r007_violations} R008=${r008_violations} turns=${total_turns}" >&2
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
    2>>"$WORKER_ERR_LOG"
  rm -f "$WORKER_SCRIPT"
) &
disown $! 2>/dev/null || true

# ── 즉시 stdin pass-through 후 exit 0 (Stop hook 체인 유지) ──
echo "$input"
exit 0
