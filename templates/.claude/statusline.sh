#!/usr/bin/env bash
# statusline.sh — Claude Code statusline renderer
#
# Reads JSON from stdin (Claude Code statusline API, ~300ms intervals)
# and outputs a formatted status line, e.g.:
#
#   Opus | my-project | develop | CTX:42% | $0.05
#
# JSON input structure:
#   {
#     "model": { "display_name": "claude-opus-4-6" },
#     "workspace": { "current_dir": "/path/to/project" },
#     "context_window": { "used_percentage": 42, "context_window_size": 200000 },
#     "cost": { "total_cost_usd": 0.05 }
#   }

# ---------------------------------------------------------------------------
# 1. Color detection
# ---------------------------------------------------------------------------
if [[ -n "${NO_COLOR}" || "${TERM}" == "dumb" ]]; then
    # Colors disabled
    COLOR_RESET=""
    COLOR_OPUS=""
    COLOR_SONNET=""
    COLOR_HAIKU=""
    COLOR_CTX_OK=""
    COLOR_CTX_WARN=""
    COLOR_CTX_CRIT=""
else
    COLOR_RESET="\033[0m"
    COLOR_OPUS="\033[1;35m"    # Magenta bold
    COLOR_SONNET="\033[0;36m"  # Cyan
    COLOR_HAIKU="\033[0;32m"   # Green
    COLOR_CTX_OK="\033[0;32m"  # Green   (< 60%)
    COLOR_CTX_WARN="\033[0;33m" # Yellow (60-79%)
    COLOR_CTX_CRIT="\033[0;31m" # Red    (>= 80%)
fi

# ---------------------------------------------------------------------------
# 2. jq availability check
# ---------------------------------------------------------------------------
if ! command -v jq >/dev/null 2>&1; then
    echo "statusline: jq required"
    exit 0
fi

# ---------------------------------------------------------------------------
# 3. Read stdin into variable
# ---------------------------------------------------------------------------
json="$(cat)"

# Guard against empty input
if [[ -z "$json" ]]; then
    echo "statusline: no input"
    exit 0
fi

# ---------------------------------------------------------------------------
# 4. Single jq call — extract all fields as TSV
#    Fields: model_name, project_dir, ctx_pct, ctx_size, cost_usd
# ---------------------------------------------------------------------------
IFS=$'\t' read -r model_name project_dir ctx_pct ctx_size cost_usd <<< "$(
    printf '%s' "$json" | jq -r '[
        (.model.display_name // "unknown"),
        (.workspace.current_dir // ""),
        (.context_window.used_percentage // 0),
        (.context_window.context_window_size // 0),
        (.cost.total_cost_usd // 0)
    ] | @tsv'
)"

# ---------------------------------------------------------------------------
# 5. Model display name + color (bash 3.2 compatible case pattern matching)
# ---------------------------------------------------------------------------
case "$model_name" in
    *[Oo]pus*)   model_display="Opus";   model_color="${COLOR_OPUS}" ;;
    *[Ss]onnet*) model_display="Sonnet"; model_color="${COLOR_SONNET}" ;;
    *[Hh]aiku*)  model_display="Haiku";  model_color="${COLOR_HAIKU}" ;;
    *)           model_display="$model_name"; model_color="${COLOR_RESET}" ;;
esac

# ---------------------------------------------------------------------------
# 6. Project name — basename of workspace current_dir
# ---------------------------------------------------------------------------
if [[ -n "$project_dir" ]]; then
    project_name="${project_dir##*/}"
else
    project_name="unknown"
fi

# ---------------------------------------------------------------------------
# 7. Git branch — read .git/HEAD directly (no subprocess, fast)
# ---------------------------------------------------------------------------
git_head_file="${project_dir}/.git/HEAD"
git_branch=""
if [[ -f "$git_head_file" ]]; then
    git_head="$(cat "$git_head_file")"
    case "$git_head" in
        "ref: refs/heads/"*)
            # Normal branch: strip the prefix
            git_branch="${git_head#ref: refs/heads/}"
            ;;
        *)
            # Detached HEAD: show first 7 chars of commit hash
            git_branch="${git_head:0:7}"
            ;;
    esac
fi

# ---------------------------------------------------------------------------
# 8. Context percentage with color
# ---------------------------------------------------------------------------
# ctx_pct may arrive as a float (e.g. 42.5); truncate to integer for comparison
ctx_int="${ctx_pct%%.*}"
# Ensure it's a valid integer (fallback to 0)
if ! [[ "$ctx_int" =~ ^[0-9]+$ ]]; then
    ctx_int=0
fi

if [[ "$ctx_int" -ge 80 ]]; then
    ctx_color="${COLOR_CTX_CRIT}"
elif [[ "$ctx_int" -ge 60 ]]; then
    ctx_color="${COLOR_CTX_WARN}"
else
    ctx_color="${COLOR_CTX_OK}"
fi

ctx_display="CTX:${ctx_int}%"

# ---------------------------------------------------------------------------
# 9. Cost formatting — always two decimal places
# ---------------------------------------------------------------------------
cost_display="$(printf '$%.2f' "$cost_usd")"

# ---------------------------------------------------------------------------
# 10. Assemble and output the status line
# ---------------------------------------------------------------------------
# Build segments; omit git branch segment when unavailable
if [[ -n "$git_branch" ]]; then
    printf "${model_color}%s${COLOR_RESET} | %s | %s | ${ctx_color}%s${COLOR_RESET} | %s\n" \
        "$model_display" \
        "$project_name" \
        "$git_branch" \
        "$ctx_display" \
        "$cost_display"
else
    printf "${model_color}%s${COLOR_RESET} | %s | ${ctx_color}%s${COLOR_RESET} | %s\n" \
        "$model_display" \
        "$project_name" \
        "$ctx_display" \
        "$cost_display"
fi
