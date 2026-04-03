---
name: pipeline
description: Invoke and resume YAML-defined pipelines by name — /pipeline auto-dev runs the full release pipeline
scope: harness
user-invocable: true
effort: high
argument-hint: "<pipeline-name> | resume | (no args to list available)"
source:
  type: external
  origin: github
  url: https://github.com/baekenough/baekenough-skills
  version: 1.0.0
---

# /pipeline — Pipeline Invocation

## Usage

```
/pipeline auto-dev          # Run the auto-dev pipeline
/pipeline                   # List available pipelines
/pipeline resume            # Resume a halted pipeline
```

## Behavior

### List Mode (no arguments or --list flag)

Execute these steps to display available pipelines:

1. **Scan built-in pipelines**: Use `Glob("workflows/*.yaml")` (NOT templates/) to find all pipeline definitions
2. **Extract metadata**: For each YAML file found, use `Bash` to extract name and description:
   ```bash
   for f in workflows/*.yaml; do
     name=$(grep -m1 '^name:' "$f" | sed 's/^name: *//' | tr -d '"')
     desc=$(grep -m1 '^description:' "$f" | sed 's/^description: *//' | tr -d '"')
     echo "  $name — $desc"
   done
   ```
3. **Scan template pipelines**: Use `Glob("templates/workflows/*.yaml")` for template examples
4. **Display formatted output**:
   ```
   Available pipelines:
     {name} — {description}
     {name} — {description}

   Template pipelines (in templates/workflows/):
     {name} — {description}
   ```
5. If no pipelines found, display: "No pipelines found in workflows/ directory."
6. If YAML parsing fails for a file, skip it and show: `  {filename} — (parse error, skipped)`

### Run Mode (with pipeline name)

1. Validate pipeline exists: `workflows/{name}.yaml`
2. Load and validate YAML structure:
   - Required fields: `name`, `description`, `steps[]`
   - Each step has either `skill:` or `prompt:` (not both)
   - Referenced skills exist in `.claude/skills/`
   - Skill names must match `^[a-z0-9-]+$` (kebab-case only) — reject path traversal attempts
3. Announce: `[Pipeline] Starting {name} — {step_count} steps`
4. Execute steps top-to-bottom:
   - **Skill steps** (`skill: name`): Invoke via Skill tool — `Skill(skill: "{name}")`
   - **Prompt steps** (`prompt: text`): Execute the described action using appropriate agents/tools
   - **Foreach steps** (`foreach: collection`): Iterate over collection from previous step output
5. Report completion or failure

### Resume Mode (/pipeline resume)

1. Scan `/tmp/.claude-pipeline-*-{PPID}.json` for state files
2. If none found: "No halted pipelines found."
3. If found: display pipeline name, failed step, error message
4. Options:
   - **Retry** — Re-execute the failed step
   - **Skip** — Mark failed step as skipped, continue to next
   - **Abort** — Delete state file, cancel pipeline
5. On resume: execute from the failed step

## State Tracking

Track per-step state:
```json
{
  "pipeline": "{name}",
  "started": "ISO-8601",
  "status": "running|completed|halted",
  "current_step": 0,
  "steps": [
    {"name": "triage", "status": "completed", "duration_ms": 5000},
    {"name": "plan", "status": "running"}
  ]
}
```

State saved to `/tmp/.claude-pipeline-{name}-{PPID}.json` on failure.

## Error Handling

- Pipeline not found → list available pipelines with suggestion
- YAML parse error → report with line number
- Step failure (error: halt-and-report) → stop execution, save state, report failure with context
- All file writes delegated to subagents per R010
