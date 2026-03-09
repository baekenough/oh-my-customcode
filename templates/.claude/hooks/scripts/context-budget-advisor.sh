#!/bin/bash
set -euo pipefail

# Context Budget Advisor Hook
# Trigger: PostToolUse (Edit/Write/Agent/Task/Read/Glob/Grep/Bash)
# Purpose: Monitor context usage and advise ecomode activation based on task type
# Protocol: stdin JSON -> stdout pass-through, exit 0 always

input=$(cat)

# Read context info from status file if available
STATUS_FILE="/tmp/.claude-env-status-${PPID}"
BUDGET_FILE="/tmp/.claude-context-budget-${PPID}"

# Initialize budget tracking file
if [ ! -f "$BUDGET_FILE" ]; then
  echo "task_type=general" > "$BUDGET_FILE"
  echo "tool_count=0" >> "$BUDGET_FILE"
  echo "write_count=0" >> "$BUDGET_FILE"
  echo "read_count=0" >> "$BUDGET_FILE"
  echo "agent_count=0" >> "$BUDGET_FILE"
fi

# Read current counts
source "$BUDGET_FILE" 2>/dev/null || true
tool_count=${tool_count:-0}
write_count=${write_count:-0}
read_count=${read_count:-0}
agent_count=${agent_count:-0}

# Determine tool type from input
TOOL=$(echo "$input" | jq -r '.tool // ""' 2>/dev/null || echo "")
tool_count=$((tool_count + 1))

case "$TOOL" in
  Write|Edit)
    write_count=$((write_count + 1))
    ;;
  Read|Glob|Grep)
    read_count=$((read_count + 1))
    ;;
  Task|Agent)
    agent_count=$((agent_count + 1))
    ;;
esac

# Infer task type based on tool usage pattern
if [ "$agent_count" -ge 4 ]; then
  task_type="research"
elif [ "$write_count" -gt "$read_count" ] && [ "$write_count" -ge 5 ]; then
  task_type="implementation"
elif [ "$read_count" -gt "$write_count" ] && [ "$read_count" -ge 10 ]; then
  task_type="review"
else
  task_type="general"
fi

# Update budget file
cat > "$BUDGET_FILE" << EOF
task_type=${task_type}
tool_count=${tool_count}
write_count=${write_count}
read_count=${read_count}
agent_count=${agent_count}
EOF

# Determine threshold for current task type
case "$task_type" in
  research)      THRESHOLD=40 ;;
  implementation) THRESHOLD=50 ;;
  review)        THRESHOLD=60 ;;
  management)    THRESHOLD=70 ;;
  *)             THRESHOLD=80 ;;
esac

# Emit advisory at milestones (every 25 tool calls)
if [ "$tool_count" -gt 0 ] && [ $((tool_count % 25)) -eq 0 ]; then
  echo "[Context Budget] Task: ${task_type} | Threshold: ${THRESHOLD}% | Tools used: ${tool_count}" >&2
  if [ "$tool_count" -ge 75 ]; then
    echo "[Context Budget] ⚠ High tool usage — consider /compact or ecomode" >&2
  fi
fi

# Pass through
echo "$input"
exit 0
