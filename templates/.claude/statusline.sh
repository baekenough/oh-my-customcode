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
#     "cost": { "total_cost_usd": 0.05 },
#     "rate_limits": {                          (v2.1.80+, optional)
#       "five_hour": { "used_percentage": 10, "resets_at": 1773979200 },
#       "seven_day": { "used_percentage": 90, "resets_at": 1773979200 }
#     }
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
    COLOR_RESET=$'\033[0m'
    COLOR_OPUS=$'\033[1;35m'    # Magenta bold
    COLOR_SONNET=$'\033[0;36m'  # Cyan
    COLOR_HAIKU=$'\033[0;32m'   # Green
    COLOR_CTX_OK=$'\033[0;32m'  # Green   (< 60%)
    COLOR_CTX_WARN=$'\033[0;33m' # Yellow (60-79%)
    COLOR_CTX_CRIT=$'\033[0;31m' # Red    (>= 80%)
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

# Debug logging for CTX investigation
if [[ -n "${STATUSLINE_DEBUG}" ]]; then
    printf '%s\n' "$json" >> "/tmp/.claude-statusline-debug-${PPID}.jsonl"
fi

# ---------------------------------------------------------------------------
# 4. Single jq call — extract all fields as TSV
#    Fields: model_name, project_dir, ctx_pct, ctx_size, cost_usd, rl_5h_pct, rl_7d_pct, rl_5h_resets, rl_7d_resets
# ---------------------------------------------------------------------------
IFS=$'\t' read -r model_name project_dir ctx_pct ctx_size cost_usd rl_5h_pct rl_7d_pct rl_5h_resets rl_7d_resets <<< "$(
    printf '%s' "$json" | jq -r '[
        (.model.display_name // "unknown"),
        (.workspace.current_dir // ""),
        (if .context_window.used != null and .context_window.total != null and .context_window.total > 0 then (.context_window.used / .context_window.total * 100) elif .context_window.used_percentage != null then .context_window.used_percentage else 0 end),
        (.context_window.context_window_size // 0),
        (.cost.total_cost_usd // 0),
        (.rate_limits.five_hour.used_percentage // -1),
        (.rate_limits.seven_day.used_percentage // -1),
        (.rate_limits.five_hour.resets_at // -1),
        (.rate_limits.seven_day.resets_at // -1)
    ] | @tsv'
)"

# ---------------------------------------------------------------------------
# 4b. Cost & context data bridge — write to temp file for hooks
# ---------------------------------------------------------------------------
COST_BRIDGE_FILE="/tmp/.claude-cost-${PPID}"
_tmp="${COST_BRIDGE_FILE}.tmp.$$"
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$cost_usd" "$ctx_pct" "$(date +%s)" "$rl_5h_pct" "$rl_7d_pct" "$rl_5h_resets" "$rl_7d_resets" > "$_tmp" 2>/dev/null && mv -f "$_tmp" "$COST_BRIDGE_FILE" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 4c. Countdown helper — converts resets_at epoch to human-readable duration
# ---------------------------------------------------------------------------
_countdown() {
    local resets_at="$1"
    if [[ "$resets_at" =~ ^[0-9]+$ ]] && [[ "$resets_at" -gt 0 ]]; then
        local now
        now=$(date +%s)
        local remaining=$((resets_at - now))
        if [[ "$remaining" -gt 0 ]]; then
            local days=$((remaining / 86400))
            local hours=$(( (remaining % 86400) / 3600 ))
            if [[ "$days" -gt 0 ]]; then
                printf '%dd%dh' "$days" "$hours"
            elif [[ "$hours" -gt 0 ]]; then
                local mins=$(( (remaining % 3600) / 60 ))
                printf '%dh%dm' "$hours" "$mins"
            else
                local mins=$((remaining / 60))
                printf '%dm' "$mins"
            fi
        fi
    fi
}

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
# 9b. Rate limit percentage with color (v2.1.80+, optional)
# ---------------------------------------------------------------------------
rl_display=""
rl_color=""
# rl_5h_pct is -1 when rate_limits field is absent (pre-v2.1.80 compatibility)
rl_5h_int="${rl_5h_pct%%.*}"
# Ensure it's a valid integer (fallback to -1)
if ! [[ "$rl_5h_int" =~ ^-?[0-9]+$ ]]; then
    rl_5h_int=-1
fi

if [[ "$rl_5h_int" -ge 0 ]]; then
    rl_display="RL:${rl_5h_int}%"
    if [[ "$rl_5h_int" -ge 80 ]]; then
        rl_color="${COLOR_CTX_CRIT}"     # Red    (>= 80%)
    elif [[ "$rl_5h_int" -ge 50 ]]; then
        rl_color="${COLOR_CTX_WARN}"     # Yellow (50-79%)
    else
        rl_color="${COLOR_CTX_OK}"       # Green  (< 50%)
    fi
fi

# Append countdown to RL display if available
rl_countdown="$(_countdown "$rl_5h_resets")"
if [[ -n "$rl_countdown" && -n "$rl_display" ]]; then
    rl_display="${rl_display} ${rl_countdown}"
fi

# ---------------------------------------------------------------------------
# 9c. Weekly rate limit percentage with color (v2.1.80+, optional)
# ---------------------------------------------------------------------------
wl_display=""
wl_color=""
wl_7d_int="${rl_7d_pct%%.*}"
if ! [[ "$wl_7d_int" =~ ^-?[0-9]+$ ]]; then
    wl_7d_int=-1
fi

if [[ "$wl_7d_int" -ge 0 ]]; then
    wl_display="WL:${wl_7d_int}%"
    if [[ "$wl_7d_int" -ge 80 ]]; then
        wl_color="${COLOR_CTX_CRIT}"     # Red    (>= 80%)
    elif [[ "$wl_7d_int" -ge 50 ]]; then
        wl_color="${COLOR_CTX_WARN}"     # Yellow (50-79%)
    else
        wl_color="${COLOR_CTX_OK}"       # Green  (< 50%)
    fi
fi

# Append countdown to WL display if available
wl_countdown="$(_countdown "$rl_7d_resets")"
if [[ -n "$wl_countdown" && -n "$wl_display" ]]; then
    wl_display="${wl_display} ${wl_countdown}"
fi

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

# Build the RL segment (with separator) if present
rl_segment=""
if [[ -n "$rl_display" ]]; then
    rl_segment=" | ${rl_color}${rl_display}${COLOR_RESET}"
fi

# Build the WL segment (with separator) if present
wl_segment=""
if [[ -n "$wl_display" ]]; then
    wl_segment=" | ${wl_color}${wl_display}${COLOR_RESET}"
fi

if [[ -n "$git_branch" ]]; then
    printf "${cost_color}%s${COLOR_RESET} | %s | %s%s%s%s | ${ctx_color}%s${COLOR_RESET}\n" \
        "$cost_display" \
        "$project_name" \
        "$branch_display" \
        "$pr_segment" \
        "$rl_segment" \
        "$wl_segment" \
        "$ctx_display"
else
    printf "${cost_color}%s${COLOR_RESET} | %s%s%s%s | ${ctx_color}%s${COLOR_RESET}\n" \
        "$cost_display" \
        "$project_name" \
        "$pr_segment" \
        "$rl_segment" \
        "$wl_segment" \
        "$ctx_display"
fi
