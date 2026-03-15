#!/bin/bash
# Stage-blocking hook: blocks Write/Edit in non-implement stages
if [ -f /tmp/.claude-dev-stage ]; then
  stage=$(cat /tmp/.claude-dev-stage | tr -d '[:space:]')
  if [ -z "$stage" ]; then exit 0; fi
  case "$stage" in
    plan|verify-plan|verify-impl|compound|done)
      echo "⛔ BLOCKED: Write/Edit disabled in '$stage' stage. Only allowed during 'implement' stage. Use 'echo implement > /tmp/.claude-dev-stage' to transition."
      exit 2
      ;;
  esac
fi
