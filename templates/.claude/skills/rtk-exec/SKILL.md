---
name: rtk-exec
description: Execute CLI commands through RTK proxy for token-optimized output
scope: core
argument-hint: "<command> [args...] [--gain] [--version] [--init]"
user-invocable: true
---

# RTK Exec Skill

Execute CLI commands through the RTK (Rust Token Killer) proxy to reduce LLM token consumption by 60-90%. RTK is a CLI command proxy — it wraps existing shell commands and compresses their output using smart filtering, grouping, truncation, and deduplication.

> **Important**: RTK is NOT an AI prompt tool. It is a CLI output compressor. You pass it a regular shell command and it returns compressed output.

## Options

```
<command> [args...]   Required. CLI command to proxy through RTK (e.g., "ls .", "git status", "cargo test")
--gain               Show token savings statistics (rtk gain)
--version            Show RTK version (rtk --version)
--init               Initialize RTK for current project (rtk init -g)
--timeout <ms>       Execution timeout (default: 120000, max: 600000)
--working-dir <dir>  Working directory for command execution
```

## Workflow

```
1. Pre-checks
   - Verify `rtk` binary is installed (which rtk)
   - No authentication required
2. Build command
   - Special: rtk gain | rtk --version | rtk init -g
   - Proxy: rtk <command> [args...]
3. Execute
   - Run via Bash tool with timeout (default 2min, max 10min)
   - Or use helper script: node .claude/skills/rtk-exec/scripts/rtk-wrapper.cjs
4. Parse output
   - RTK always returns plain text compressed output (no JSON modes)
   - Capture stdout and stderr
5. Report results
   - Format output with execution metadata and token savings info
```

## Supported Commands

RTK supports 100+ CLI commands across categories:

| Category | Commands |
|----------|----------|
| File ops | `ls`, `find`, `grep`, `cat`, `tree`, `du`, `diff` |
| Git | `git status`, `git log`, `git diff`, `git push`, `git pull`, `git branch` |
| Test runners | `cargo test`, `pytest`, `vitest`, `jest`, `go test`, `bun test` |
| Linters | `eslint`, `tsc`, `ruff`, `clippy`, `golangci-lint`, `rubocop` |
| Package managers | `pnpm install`, `pip install`, `cargo build`, `npm install` |
| Containers | `docker build`, `docker ps`, `kubectl get`, `kubectl logs` |
| Build tools | `make`, `cmake`, `gradle`, `mvn` |
| System | `ps`, `top`, `df`, `netstat`, `env` |

## Output Format

### Success
```
[RTK Exec] Completed

Command: rtk git status
Duration: 0.3s
Working Dir: /path/to/project

--- Output ---
{rtk compressed output}
```

### Success (--gain)
```
[RTK Exec] Token Savings

--- Gain Report ---
{rtk gain statistics showing tokens saved per command}
```

### Failure
```
[RTK Exec] Failed

Command: rtk cargo test
Error: {error_message}
Exit Code: {code}
Stderr: {stderr}
Suggested Fix: {suggestion}
```

## Helper Script

For complex executions or programmatic use:
```bash
node .claude/skills/rtk-exec/scripts/rtk-wrapper.cjs --command "cargo test" [options]
```

The wrapper provides:
- Binary availability check
- Safe command construction
- Timeout handling with graceful SIGTERM → SIGKILL escalation
- Structured JSON output for programmatic consumption

## Examples

```bash
# List files with compression
/rtk-exec "ls -la src/"

# Git status (often 70%+ token reduction)
/rtk-exec "git status"

# Run Rust tests
/rtk-exec "cargo test"

# Run Python tests
/rtk-exec "pytest tests/ -v"

# TypeScript type check
/rtk-exec "tsc --noEmit"

# Show token savings stats
/rtk-exec --gain

# Initialize RTK for project
/rtk-exec --init

# With timeout override
/rtk-exec "cargo build --release" --timeout 300000

# Specify working directory
/rtk-exec "git log --oneline -20" --working-dir /path/to/repo
```

## Integration

Works with the orchestrator pattern:
- Main conversation delegates CLI execution via this skill
- Results are returned to the main conversation for further processing
- Particularly effective for test runs, lint checks, and git operations where output is verbose
- Can be chained: rtk-exec for output collection → Claude expert for analysis

## Availability Check

rtk-exec requires the RTK binary to be installed. The skill is only usable when:

1. `rtk` binary is found in PATH (`which rtk` succeeds)
2. No authentication or API keys required

If the binary check fails, this skill cannot be used. Fall back to direct Bash tool execution.

> **Note**: This skill is invoked via `/rtk-exec` command or delegated by the orchestrator. It is most useful for any task that produces verbose CLI output that would otherwise consume large amounts of context tokens.

## Agent Teams Integration

When used within Agent Teams:

1. **As delegated task**: orchestrator explicitly delegates CLI execution for token-efficient output
2. **Hybrid workflow**: Claude team member plans → rtk-exec runs commands → Claude analyzes compressed output
3. **Batch execution**: Multiple rtk-exec invocations in parallel for different commands

```
Orchestrator delegates CLI task
  → /rtk-exec invoked with command
  → Compressed output returned to orchestrator
  → Analyst processes compressed result
  → Iterate if needed
```

## Token Savings

RTK uses four compression strategies:

| Strategy | Description | Typical Savings |
|----------|-------------|-----------------|
| Smart Filtering | Removes redundant/noise lines based on command type | 30-50% |
| Grouping | Collapses repeated patterns into summary counts | 20-40% |
| Truncation | Clips excessively long lines with ellipsis | 10-20% |
| Deduplication | Removes identical repeated output blocks | 15-30% |

Combined effect: **60-90% token reduction** on typical CLI output (git log, test results, lint reports).

## Installation

```bash
# macOS via Homebrew
brew install rtk

# Universal install script
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

# From source via Cargo
cargo install --git https://github.com/rtk-ai/rtk

# Verify installation
rtk --version
```
