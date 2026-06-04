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
   - **Parallel steps** (`parallel: [step1, step2]`): Execute contained steps concurrently using Agent tool. Each parallel step runs as an independent Agent. Max 4 concurrent per R009. Steps within a parallel block MUST be independent (no shared state, no sequential dependencies). Dependencies between parallel and non-parallel steps use `depends_on:` field.
   - **Agent mode**: When spawning agents via Agent tool, always pass `mode: "bypassPermissions"` to match agent frontmatter. The Agent tool default (`acceptEdits`) overrides frontmatter `permissionMode`, causing permission prompts during unattended execution.
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

## Parallel Execution

Pipeline steps can be grouped for parallel execution:

```yaml
steps:
  - name: phase-1
    parallel:
      - name: task-a
        skill: skill-a
        description: First independent task
      - name: task-b
        skill: skill-b
        description: Second independent task
  - name: phase-2
    skill: next-step
    depends_on: phase-1
```

### Parallel Rules

- Max 4 concurrent steps per parallel block (R009 hard cap)
- Steps within a parallel block MUST be independent
- `depends_on` enforces ordering between blocks
- Each parallel step is spawned as a separate Agent tool call in the SAME message
- If any parallel step fails with `error: halt-and-report`, all remaining steps in the block are cancelled
- State tracking records each parallel step individually

### Parallel State Format

```json
{
  "name": "phase-1",
  "type": "parallel",
  "status": "running",
  "children": [
    {"name": "task-a", "status": "completed", "duration_ms": 5000},
    {"name": "task-b", "status": "running"}
  ]
}
```

## Workflow File Locations

The `auto-dev.yaml` (and other workflow YAML files) exist in **4 locations**. Only one is the runtime source — the others are mirrors for deployment and examples.

| Path | Role | Used by |
|------|------|---------|
| `.claude/skills/pipeline/workflows/auto-dev.yaml` | **Runtime source (실행본)** — `/pipeline` reads from here via `Glob("workflows/*.yaml")` relative to the skill base dir | `/pipeline` skill at runtime |
| `templates/.claude/skills/pipeline/workflows/auto-dev.yaml` | Init deployment mirror — copied to the runtime location when `omcustom init` runs | `omcustom init` |
| `workflows/auto-dev.yaml` (repo root) | Legacy `/omcustom:workflow` directory remnant — NOT referenced by `/pipeline`. Also contains `eraser.yaml` and template examples. | Unused after `/pipeline` migration |
| `templates/workflows/auto-dev.yaml` | Template example mirror — Glob'd by List Mode as "template examples" (`Glob("templates/workflows/*.yaml")`) | `/pipeline` List Mode display only |

**Key rules:**
- The runtime source is `.claude/skills/pipeline/workflows/` (skill base dir). Do NOT confuse with repo-root `workflows/`.
- When modifying any workflow YAML, update **all applicable mirrors** to prevent drift. `verify-template-sync.sh` (#1286) detects drift automatically on CI.
- Repo-root `workflows/` is a legacy `/omcustom:workflow` remnant. It contains `eraser.yaml`, **deprecated as of v0.167.0 (#1289)** — retained but unmaintained: its ARCHITECTURE.md-sync function moved to the release workflow + validate-docs, and its diagram generation to the `eraser-diagrams` plugin skill. Not reachable via `/pipeline`. Do not delete without checking for other references.

## Error Handling

- Pipeline not found → list available pipelines with suggestion
- YAML parse error → report with line number
- Step failure (error: halt-and-report) → stop execution, save state, report failure with context
- All file writes delegated to subagents per R010
