---
name: codex-exec
description: Execute OpenAI Codex CLI prompts and return results
argument-hint: "<prompt> [--json] [--output <path>] [--model <name>] [--timeout <ms>]"
---

# Codex Exec Skill

Execute OpenAI Codex CLI prompts in non-interactive mode and return structured results. Enables Claude + Codex hybrid workflows.

## Options

```
<prompt>          Required. The prompt to send to Codex CLI
--json            Return structured JSON Lines output
--output <path>   Save final message to file
--model <name>    Model override (o3, o4-mini, etc.)
--timeout <ms>    Execution timeout (default: 120000, max: 600000)
--full-auto       Enable auto-approval mode (codex -a full-auto)
--working-dir     Working directory for Codex execution
```

## Workflow

```
1. Pre-checks
   - Verify `codex` binary is installed (which codex || npx codex --version)
   - Verify authentication (OPENAI_API_KEY or logged in)
2. Build command
   - Base: codex exec --ephemeral "<prompt>"
   - Apply options: --json, --model, --full-auto, -C <dir>
   - Set --working-dir if specified
3. Execute
   - Run via Bash tool with timeout (default 2min, max 10min)
   - Or use helper script: node .claude/skills/codex-exec/scripts/codex-wrapper.cjs
4. Parse output
   - Text mode: return raw stdout
   - JSON mode: parse JSON Lines, extract final assistant message
5. Report results
   - Format output with execution metadata
```

## Safety Defaults

- `--ephemeral`: No session persistence (conversations not saved)
- Default mode: Normal approval (Codex prompts for confirmation)
- Override with `--full-auto` only when explicitly requested

## Output Format

### Success (Text Mode)
```
[Codex Exec] Completed

Model: o3
Duration: 23.4s
Working Dir: /path/to/project

--- Output ---
{codex response text}
```

### Success (JSON Mode)
```
[Codex Exec] Completed (JSON)

Model: o3
Duration: 23.4s
Events: 12

--- Final Message ---
{extracted final assistant message}
```

### Failure
```
[Codex Exec] Failed

Error: {error_message}
Exit Code: {code}
Suggested Fix: {suggestion}
```

## Helper Script

For complex executions, use the wrapper script:
```bash
node .claude/skills/codex-exec/scripts/codex-wrapper.cjs --prompt "your prompt" [options]
```

The wrapper provides:
- Environment validation (binary + auth checks)
- Safe command construction
- JSON Lines parsing with event extraction
- Structured JSON output
- Timeout handling with graceful termination

## Examples

```bash
# Simple text prompt
codex-exec "explain what this project does"

# JSON output with model override
codex-exec "list all TODO items" --json --model o4-mini

# Save output to file
codex-exec "generate a README" --output ./README.md

# Full auto mode with custom timeout
codex-exec "fix the failing tests" --full-auto --timeout 300000

# Specify working directory
codex-exec "analyze the codebase" --working-dir /path/to/project
```

## Integration

Works with the orchestrator pattern:
- Main conversation delegates Codex execution via this skill
- Results are returned to the main conversation for further processing
- Can be chained with other skills (e.g., dev-review after Codex generates code)

## Availability Check

codex-exec requires the Codex CLI binary to be installed and authenticated. The skill is only usable when:

1. `codex` binary is found in PATH (`which codex` succeeds)
2. Authentication is valid (OPENAI_API_KEY set or `codex` logged in)

If either check fails, this skill cannot be used. Fall back to Claude agents for the task.

> **Note**: `disable-model-invocation: true` is set intentionally. This skill must be explicitly invoked via `/codex-exec` or delegated by the orchestrator. It is NOT auto-invoked by the model.

## Agent Teams Integration

When used within Agent Teams (requires explicit invocation):

1. **As delegated task**: orchestrator explicitly delegates codex-exec for code generation
2. **Hybrid workflow**: Claude team member analyzes → orchestrator invokes codex-exec → Claude reviews
3. **Iteration**: Team messaging enables review-fix cycles between Claude and Codex outputs

```
Orchestrator delegates generation task
  → /codex-exec invoked explicitly
  → Output returned to orchestrator
  → Reviewer validates quality
  → Iterate if needed
```
