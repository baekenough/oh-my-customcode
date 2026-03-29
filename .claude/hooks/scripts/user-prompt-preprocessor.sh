#!/bin/bash
# UserPromptSubmit hook — advisory pre-processing of user input
# Provides skill matching hints based on user input patterns
# Advisory only — never blocks user prompt submission

input=$(cat)
user_input=$(echo "$input" | jq -r '.user_input // ""' 2>/dev/null)

if [ -z "$user_input" ]; then
  echo "$input"
  exit 0
fi

# Detect common patterns and provide advisory hints
hints=""

# Korean session-end signals
if echo "$user_input" | grep -qiE '(끝|종료|마무리|done|wrap up|end session)'; then
  hints="${hints}[Hook] Session-end signal detected — R011 memory saves will be triggered\n"
fi

# Workflow invocation
if echo "$user_input" | grep -qE '^/'; then
  hints="${hints}[Hook] Slash command detected\n"
fi

# Output hints to stderr (advisory)
if [ -n "$hints" ]; then
  printf "%b" "$hints" >&2
fi

echo "$input"
