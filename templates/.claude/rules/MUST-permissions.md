# [MUST] Permission Rules

> **Priority**: MUST | **ID**: R002

## Tool Permission Tiers

| Tier | Tools | Policy |
|------|-------|--------|
| 1: Always | Read, Glob, Grep, ToolSearch | Free use, read-only |
| 2: Default | Write, Edit, NotebookEdit | State changes explicitly, notify before modifying important files |
| 3: Context | Agent, Skill, EnterPlanMode, ExitPlanMode, EnterWorktree, ExitWorktree, LSP, Monitor, TodoWrite, AskUserQuestion, PushNotification | Context-dependent, no user approval needed |
| 4: Approval | Bash, PowerShell, WebFetch, WebSearch | Request user approval on first use |
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

## Agent Tool Permission Mode

When spawning subagents via the Agent tool, always pass `mode: "bypassPermissions"` explicitly. The Agent tool's default mode is `acceptEdits`, which **overrides** the agent frontmatter `permissionMode` field.

| Setting | Effect |
|---------|--------|
| Agent frontmatter `permissionMode: bypassPermissions` | Ignored if Agent tool `mode` not set |
| Agent tool `mode: "bypassPermissions"` | **Required** — actually controls subagent permissions |
| Agent tool `mode` omitted | Defaults to `acceptEdits` → prompts for Bash, WebFetch |

Skills that spawn agents MUST include `mode: "bypassPermissions"` in their Agent tool call instructions. This applies to all routing skills, pipeline skills, and any skill that delegates work to subagents.
