# [MUST] Permission Rules

> **Priority**: MUST | **ID**: R002

## Tool Permission Tiers

| Tier | Tools | Policy |
|------|-------|--------|
| 1: Always | Read, Glob, Grep | Free use |
| 2: Default | Write, Edit | State changes explicitly, notify before modifying important files |
| 3: Approval | Bash, WebFetch, WebSearch | Request user approval on first use |
| 4: Explicit | Task | Only when user explicitly requests |

## File Access

| Operation | Allowed | Prohibited |
|-----------|---------|-----------|
| Read | All source, configs, docs | - |
| Write | Source code, new files in project | .env, .git/config, paths outside project |
| Delete | Temp files created by agent | Existing files (without request), entire directories |

## Permission Request Format

```
[Permission Request]
Action: {action} | Required: {tool} | Reason: {why} | Risk: Low/Medium/High
Approve?
```

On insufficient permission: do not attempt, notify user, suggest alternative.
