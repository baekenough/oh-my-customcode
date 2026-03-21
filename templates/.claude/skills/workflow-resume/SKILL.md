---
name: workflow-resume
description: Resume a halted workflow from its last failure point
scope: harness
user-invocable: true
effort: medium
---

# /workflow:resume — Resume Halted Workflow

## Usage

```
/workflow:resume            # Find and resume the most recent halted workflow
```

## Behavior

1. Scan `/tmp/.claude-workflow-*-$PPID.json` for state files
2. If none found: "No halted workflows found."
3. If found: display workflow name, failed step, error message
4. Options:
   - **Retry** — Re-execute the failed step
   - **Skip** — Mark failed step as skipped, continue to next
   - **Abort** — Delete state file, cancel workflow
5. On resume: invoke workflow-runner with state file context
