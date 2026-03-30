---
name: gemini-exec
description: Execute Gemini CLI prompts and return results
scope: core
argument-hint: "<prompt> [--json] [--stream-json] [--output <path>] [--model <name>] [--timeout <ms>] [--sandbox] [--plan]"
user-invocable: true
---

# Gemini Exec Skill

Execute Google Gemini CLI prompts in non-interactive mode and return structured results. Enables Claude + Gemini hybrid workflows.

## Options

```
<prompt>          Required. The prompt to send to Gemini CLI
--json            Return structured JSON output (-o json)
--stream-json     Return streaming JSON events (-o stream-json)
--output <path>   Save response to file
--model <name>    Model override (default: Gemini CLI default)
--timeout <ms>    Execution timeout (default: 120000, max: 600000)
--yolo            Enable auto-approval mode (gemini -y)
--sandbox         Run in sandbox mode (gemini -s)
--plan            Use plan approval mode (--approval-mode plan)
--working-dir     Working directory for Gemini execution
```

## Workflow

```
1. Pre-checks
   - Verify `gemini` binary is installed (which gemini)
   - Verify authentication (GOOGLE_API_KEY, GEMINI_API_KEY, or gcloud auth)
2. Build command
   - Base: gemini -p "<prompt>"
   - Apply options: -o json, -m <model>, -y, -s, --approval-mode plan
3. Execute
   - Run via Bash tool with timeout (default 2min, max 10min)
   - Or use helper script: node .claude/skills/gemini-exec/scripts/gemini-wrapper.cjs
4. Parse output
   - Text mode: return raw stdout
   - JSON mode: parse single JSON object, extract response field
   - Stream-JSON mode: parse event stream, extract final assistant message
5. Report results
   - Format output with execution metadata
```

## Safety Defaults

- `-p` flag: Non-interactive prompt mode (no session persistence)
- Default mode: Normal approval (Gemini prompts for confirmation)
- Override with `--yolo` only when explicitly requested
- Sandbox mode (`-s`) available for isolated execution

## Output Format

### Success (Text Mode)
```
[Gemini Exec] Completed

Model: (default)
Duration: 23.4s
Working Dir: /path/to/project

--- Output ---
{gemini response text}
```

### Success (JSON Mode)
```
[Gemini Exec] Completed (JSON)

Model: (default)
Duration: 23.4s

--- Response ---
{extracted response from JSON}

--- Stats ---
{token usage and other stats}
```

### Success (Stream-JSON Mode)
```
[Gemini Exec] Completed (Stream-JSON)

Model: (default)
Duration: 23.4s
Events: 12

--- Final Message ---
{extracted final assistant message}
```

### Failure
```
[Gemini Exec] Failed

Error: {error_message}
Exit Code: {code}
Suggested Fix: {suggestion}
```

## Helper Script

For complex executions, use the wrapper script:
```bash
node .claude/skills/gemini-exec/scripts/gemini-wrapper.cjs --prompt "your prompt" [options]
```

The wrapper provides:
- Environment validation (binary + auth checks)
- Safe command construction
- JSON and stream-JSON parsing with response extraction
- Structured JSON output
- Timeout handling with graceful termination

## Examples

```bash
# Simple text prompt
gemini-exec "explain what this project does"

# JSON output with model override
gemini-exec "list all TODO items" --json --model gemini-2.5-pro

# Stream-JSON for detailed event tracking
gemini-exec "analyze the codebase" --stream-json

# Save output to file
gemini-exec "generate a README" --output ./README.md

# Sandbox mode with auto-approval
gemini-exec "fix the failing tests" --yolo --sandbox

# Plan mode for careful execution
gemini-exec "refactor the auth module" --plan

# Specify working directory
gemini-exec "analyze the codebase" --working-dir /path/to/project
```

## Integration

Works with the orchestrator pattern:
- Main conversation delegates Gemini execution via this skill
- Results are returned to the main conversation for further processing
- Can be chained with other skills (e.g., dev-review after Gemini generates code)

## Availability Check

gemini-exec requires the Gemini CLI binary to be installed and authenticated. The skill is only usable when:

1. `gemini` binary is found in PATH (`which gemini` succeeds)
2. Authentication is valid (GOOGLE_API_KEY, GEMINI_API_KEY set, or gcloud auth active)

If either check fails, this skill cannot be used. Fall back to Claude agents for the task.

> **Note**: This skill is invoked via `/gemini-exec` command, delegated by the orchestrator, or suggested by routing skills when gemini is available. The intent-detection system can trigger it for research and code generation hybrid workflows.

## Agent Teams Integration

When used within Agent Teams (requires explicit invocation):

1. **As delegated task**: orchestrator explicitly delegates gemini-exec for code generation
2. **Hybrid workflow**: Claude team member analyzes → orchestrator invokes gemini-exec → Claude reviews
3. **Iteration**: Team messaging enables review-fix cycles between Claude and Gemini outputs

```
Orchestrator delegates generation task
  → /gemini-exec invoked explicitly
  → Output returned to orchestrator
  → Reviewer validates quality
  → Iterate if needed
```

## Research Workflow

When the orchestrator or intent-detection detects a research request:

1. **Check Gemini availability**: Verify `gemini` binary and auth
2. **If available**: Execute prompt for research
3. **If unavailable**: Fall back to Claude's WebFetch/WebSearch

### Research Command Pattern
```
/gemini-exec "Research and analyze: {topic}. Provide structured findings with sources." --json
```

## Code Generation Workflow

When routing skills detect a code generation task and gemini is available:

1. **Check availability**: Verify gemini CLI via `/tmp/.claude-env-status-*`
2. **If available + new file creation**: Suggest hybrid workflow
3. **Hybrid pattern**:
   - gemini-exec generates initial code (fast, broad generation)
   - Claude expert reviews for quality, patterns, best practices
   - Iterate if needed

### Suitable Tasks
- New file scaffolding
- Boilerplate generation
- Test stub creation
- Documentation generation

### Unsuitable Tasks
- Modifying existing code (Claude expert better at understanding context)
- Architecture decisions (requires reasoning, not generation)
- Bug fixes (requires deep code understanding)

### Code Generation Command Pattern
```
/gemini-exec "Generate {description} following {framework} best practices" --yolo
```
