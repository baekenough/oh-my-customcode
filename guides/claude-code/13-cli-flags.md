# Claude Code CLI Flags & Modes

## CLI Flags Reference

| Flag | Description | Example |
|------|------------|---------|
| `--worktree` | Run in isolated git worktree | `claude --worktree "fix bug"` |
| `--remote` | Connect to remote Claude Code instance | `claude --remote` |
| `--bare` | Minimal UI, no statusline | `claude --bare` |
| `--agent <name>` | Use specific agent as main thread | `claude --agent lang-golang-expert` |
| `--agents` | List available agents | `claude --agents` |
| `--from-pr <url>` | Start from a pull request | `claude --from-pr https://github.com/org/repo/pull/123` |
| `--chrome` | Enable Chrome browser automation | `claude --chrome` |
| `--json-schema` | Output JSON schema for structured output | `claude --json-schema schema.json` |
| `--max-budget-usd <n>` | Set maximum spend cap | `claude --max-budget-usd 5.00` |
| `--fallback-model <id>` | Model to use when primary unavailable | `claude --fallback-model claude-sonnet-4-6` |
| `--fork-session` | Fork an existing session | `claude --fork-session` |
| `--teleport` | Transfer session context to another terminal | `claude --teleport` |

## Headless Mode (`claude -p`)

Headless mode runs Claude Code non-interactively, useful for CI/CD pipelines and automated workflows.

```bash
# Basic pipe mode
echo "explain this code" | claude -p

# With JSON output
echo "list all TODOs" | claude -p --output-format json

# Stream JSON events
echo "refactor this function" | claude -p --output-format stream-json

# With specific model
echo "review PR" | claude -p --model claude-sonnet-4-6
```

### Output Formats

| Format | Flag | Description |
|--------|------|-------------|
| Text | (default) | Plain text output |
| JSON | `--output-format json` | Structured JSON response |
| Stream JSON | `--output-format stream-json` | Newline-delimited JSON events |

### CI Integration

```yaml
# GitHub Actions example
- name: Claude Code Review
  run: echo "Review this PR for security issues" | claude -p --max-budget-usd 2.00
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Scheduled Agents (CronCreate)

Claude Code supports native scheduled agents via `CronCreate`, `CronDelete`, and `CronList` tools.

```bash
# Create a scheduled agent
# CronCreate(schedule: "0 9 * * 1-5", prompt: "check for stale PRs", name: "pr-checker")

# List scheduled agents
# CronList()

# Delete a scheduled agent
# CronDelete(name: "pr-checker")
```

### Schedule Format

Standard cron syntax: `minute hour day-of-month month day-of-week`

| Pattern | Description |
|---------|-------------|
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 */6 * * *` | Every 6 hours |
| `0 0 * * 0` | Weekly on Sunday midnight |

### RemoteTrigger

For on-demand execution of scheduled agents:

```bash
# Trigger a scheduled agent immediately
# RemoteTrigger(name: "pr-checker")
```

## Auto Mode Configuration

Auto mode allows Claude Code to make decisions about tool permissions autonomously.

### Settings

```json
{
  "autoMode": {
    "environment": "local",
    "allow": ["Read", "Write", "Edit", "Glob", "Grep"],
    "soft_deny": ["Bash(rm *)", "Bash(git push --force)"]
  }
}
```

### CLI Commands

```bash
claude auto-mode defaults    # Show default auto mode settings
claude auto-mode config      # Configure auto mode
claude auto-mode critique    # Review auto mode decisions
```

| Field | Description |
|-------|-------------|
| `environment` | Execution context (`local`, `ci`, `container`) |
| `allow` | Tools auto-approved without prompting |
| `soft_deny` | Tool patterns that trigger warning before execution |

## Environment Variables

### Model & Behavior

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_MODEL` | Override default model | `claude-opus-4-6` |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Override subagent model | `claude-haiku-4-5` |
| `CLAUDE_CODE_EFFORT_LEVEL` | Set effort level | `high` |
| `CLAUDE_CODE_DISABLE_FAST_MODE` | Disable fast mode | `1` |

### Agent Teams

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | Enable Agent Teams (`1`) |

### Data Privacy

| Variable | Description |
|----------|-------------|
| `DISABLE_TELEMETRY` | Disable all telemetry collection |
| `DISABLE_ERROR_REPORTING` | Disable error reporting to Anthropic |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | Disable non-essential network traffic |
| `CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY` | Disable feedback survey prompts |
| `DO_NOT_TRACK` | Standard DNT signal — disables tracking |

## Related

- [Monitoring Guide](10-monitoring.md) — OTel metrics and events
- [Sub-agents Guide](11-sub-agents.md) — Agent spawning and coordination
- [Workflow Patterns](12-workflow-patterns.md) — Workflow automation
