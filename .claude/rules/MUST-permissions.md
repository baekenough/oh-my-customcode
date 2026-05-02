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
| Write | Source code, new files in project, `.claude/**` (CC v2.1.121+ under `bypassPermissions`) | .env, .git/config, paths outside project |
| Delete | Temp files created by agent | Existing files (without request), entire directories |

> **Sensitive paths note**: As of CC v2.1.121 (2026-04-28) and further relaxed in v2.1.126 (2026-05-01), `.claude/`, `.git/`, `.vscode/` are no longer prompted for Write/Edit/Bash under `mode: "bypassPermissions"`. The legacy `/tmp/*.sh` script bypass (R010 historical section) is deprecated for CC >= v2.1.121. Catastrophic operations (`rm -rf /`) remain blocked. See #1101.

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
