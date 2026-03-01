#!/usr/bin/env bash
# statusline.sh — Claude Code statusline renderer
#
# Reads JSON from stdin (Claude Code statusline API, ~300ms intervals)
# and outputs a formatted status line, e.g.:
#
#   $0.05 | my-project | develop | PR #160 | CTX:42%
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
#    Model detection (kept for internal reference, not displayed in statusline)
# ---------------------------------------------------------------------------
case "$model_name" in
    *[Oo]pus*)   model_display="Opus";   model_color="${COLOR_OPUS}" ;;
    *[Ss]onnet*) model_display="Sonnet"; model_color="${COLOR_SONNET}" ;;
    *[Hh]aiku*)  model_display="Haiku";  model_color="${COLOR_HAIKU}" ;;
    *)           model_display="$model_name"; model_color="${COLOR_RESET}" ;;
esac

# ---------------------------------------------------------------------------
# 5b. Cost display — format and colorize session API cost
# ---------------------------------------------------------------------------
# Ensure cost_usd is a valid number (fallback to 0)
if [[ -z "$cost_usd" ]] || ! printf '%f' "$cost_usd" >/dev/null 2>&1; then
    cost_usd="0"
fi

cost_display=$(printf '$%.2f' "$cost_usd")

# Color by cost threshold (cents for integer comparison)
cost_cents=$(printf '%.0f' "$(echo "$cost_usd * 100" | bc 2>/dev/null || echo 0)")
if ! [[ "$cost_cents" =~ ^[0-9]+$ ]]; then
    cost_cents=0
fi

if [[ "$cost_cents" -ge 500 ]]; then
    cost_color="${COLOR_CTX_CRIT}"    # Red    (>= $5.00)
elif [[ "$cost_cents" -ge 100 ]]; then
    cost_color="${COLOR_CTX_WARN}"    # Yellow ($1.00 - $4.99)
else
    cost_color="${COLOR_CTX_OK}"      # Green  (< $1.00)
fi

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
# 7b. Branch URL — for OSC 8 clickable link
# ---------------------------------------------------------------------------
branch_url=""
if [[ -n "$git_branch" && -n "$project_dir" ]]; then
    # Get remote URL from git config
    git_config="${project_dir}/.git/config"
    if [[ -f "$git_config" ]]; then
        # Extract remote origin URL from git config (no subprocess)
        remote_url=""
        in_remote_origin=false
        while IFS= read -r line; do
            case "$line" in
                '[remote "origin"]')
                    in_remote_origin=true
                    ;;
                '['*)
                    in_remote_origin=false
                    ;;
                *)
                    if $in_remote_origin; then
                        case "$line" in
                            *url\ =*)
                                remote_url="${line#*url = }"
                                ;;
                        esac
                    fi
                    ;;
            esac
        done < "$git_config"

        # Convert remote URL to HTTPS browse URL
        if [[ -n "$remote_url" ]]; then
            case "$remote_url" in
                git@github.com:*)
                    # git@github.com:owner/repo.git → https://github.com/owner/repo
                    repo_path="${remote_url#git@github.com:}"
                    repo_path="${repo_path%.git}"
                    branch_url="https://github.com/${repo_path}/tree/${git_branch}"
                    ;;
                https://github.com/*)
                    # https://github.com/owner/repo.git → https://github.com/owner/repo
                    repo_path="${remote_url#https://github.com/}"
                    repo_path="${repo_path%.git}"
                    branch_url="https://github.com/${repo_path}/tree/${git_branch}"
                    ;;
            esac
        fi
    fi
fi

# ---------------------------------------------------------------------------
# 8. PR number — cached by branch to avoid gh call on every refresh
# ---------------------------------------------------------------------------
pr_display=""
if [[ -n "$git_branch" ]] && command -v gh >/dev/null 2>&1; then
    cache_file="/tmp/statusline-pr-${project_name}"
    cached_branch=""
    cached_pr=""

    if [[ -f "$cache_file" ]]; then
        IFS=$'\t' read -r cached_branch cached_pr < "$cache_file"
    fi

    if [[ "$cached_branch" == "$git_branch" ]]; then
        # Cache hit — use cached PR number
        pr_number="$cached_pr"
    else
        # Cache miss — query gh and update cache
        pr_number="$(gh pr view --json number -q .number 2>/dev/null || echo "")"
        printf '%s\t%s\n' "$git_branch" "$pr_number" > "$cache_file"
    fi

    if [[ -n "$pr_number" ]]; then
        pr_display="PR #${pr_number}"
    fi
fi

# ---------------------------------------------------------------------------
# 9. Context percentage with color
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
# 10. Assemble and output the status line
# ---------------------------------------------------------------------------
# Format branch with optional OSC 8 hyperlink
if [[ -n "$branch_url" && -n "${COLOR_RESET}" ]]; then
    # OSC 8 hyperlink: ESC]8;;URL BEL visible-text ESC]8;; BEL
    branch_display=$'\033]8;;'"${branch_url}"$'\a'"${git_branch}"$'\033]8;;\a'
else
    branch_display="$git_branch"
fi

# Build the PR segment (with separator) if present
pr_segment=""
if [[ -n "$pr_display" ]]; then
    pr_segment=" | ${pr_display}"
fi

if [[ -n "$git_branch" ]]; then
    printf "${cost_color}%s${COLOR_RESET} | %s | %s%s | ${ctx_color}%s${COLOR_RESET}\n" \
        "$cost_display" \
        "$project_name" \
        "$branch_display" \
        "$pr_segment" \
        "$ctx_display"
else
    printf "${cost_color}%s${COLOR_RESET} | %s%s | ${ctx_color}%s${COLOR_RESET}\n" \
        "$cost_display" \
        "$project_name" \
        "$pr_segment" \
        "$ctx_display"
fi
