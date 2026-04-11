# [MUST] Permission Rules

> **Priority**: MUST | **ID**: R002

## Tool Permission Tiers

| Tier | Tools | Policy |
|------|-------|--------|
| 1: Always | Read, Glob, Grep, ToolSearch | Free use, read-only |
| 2: Default | Write, Edit, NotebookEdit | State changes explicitly, notify before modifying important files |
| 3: Context | Agent, Skill, EnterPlanMode, ExitPlanMode, EnterWorktree, ExitWorktree, LSP, Monitor, TodoWrite, AskUserQuestion | Context-dependent, no user approval needed |
| 4: Approval | Bash, WebFetch, WebSearch | Request user approval on first use |
| 5: Conditional | TeamCreate, TeamDelete, SendMessage, TaskCreate, TaskGet, TaskList, TaskUpdate, TaskStop, TaskOutput | Available when Agent Teams enabled |
| 6: MCP | ListMcpResourcesTool, ReadMcpResourceTool, CronCreate, CronDelete, CronList, RemoteTrigger | MCP/extension tools, available when servers configured |

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
