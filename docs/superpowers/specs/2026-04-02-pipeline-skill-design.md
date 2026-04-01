# Pipeline Skill Design Spec

## Overview

`pipeline` — A YAML-based sequential workflow engine for AI coding agents. Supports pipeline definition, listing, execution, and resume. Distributed as a standalone skill via skills.sh marketplace.

Installation: `npx skills add baekenough/baekenough-skills --skill pipeline`

## Commands

| Command | Description |
|---------|-------------|
| `/pipeline` | List available pipelines |
| `/pipeline <name>` | Execute a named pipeline |
| `/pipeline resume` | Resume a halted pipeline |
| `/pipeline add <natural language>` | Create pipeline from natural language description |
| `/pipeline delete <name>` | Delete a pipeline |
| `/pipeline --dir <path>` | Override pipeline directory (combinable with other commands) |

## YAML Schema

```yaml
name: deploy
description: "Build, test, and deploy to staging"
error: halt-and-report          # halt-and-report (default) | continue
mode: confirm                   # confirm (default) | auto

steps:
  - name: lint
    skill: dev-review
    description: Run lint checks

  - name: test
    prompt: "Run the full test suite and report results"
    description: Execute all tests

  - name: build
    prompt: "Build the project for production"
    description: Production build
    condition: "tests passed"

  - name: deploy
    skill: vercel-deploy
    description: Deploy to staging
    input: build-output

  - name: notify
    prompt: "Summarize deployment results"
    foreach: deploy-results
```

### Required Fields

- Top-level: `name`, `description`, `steps[]`
- Per step: `name` + (`skill:` or `prompt:`) + `description`

### Optional Fields

- Per step: `condition` (natural language guard), `input` (reference previous step), `foreach` (iterate over collection)
- Top-level: `error` (halt-and-report | continue), `mode` (confirm | auto)

All of `condition`, `input`, `foreach` are natural language — the agent interprets them from context.

## Step Types

| Type | Execution |
|------|-----------|
| `skill: name` | Invoke via Skill tool |
| `prompt: text` | Agent interprets and executes the prompt directly |

## Pipeline Add (Natural Language)

```
/pipeline add lint, test, build in sequence, halt on failure, name it release
-> Agent parses natural language
-> Shows YAML preview
-> User confirms
-> Saves to workflows/release.yaml
```

## Pipeline Delete

```
/pipeline delete release
-> Verify workflows/release.yaml exists
-> Confirm deletion
-> Remove file
```

## Execution Engine

### Flow

```
Load YAML -> Validate -> Execute steps sequentially -> Track state -> Report completion/failure
```

### State File

`/tmp/.claude-pipeline-{name}-{PPID}.json`:

```json
{
  "pipeline": "release",
  "started": "ISO-8601",
  "status": "running|completed|halted",
  "current_step": 1,
  "steps": [
    {"name": "review", "status": "completed", "duration_ms": 5000},
    {"name": "test", "status": "halted", "error": "3 tests failed"}
  ]
}
```

### Error Handling

| `error` value | Behavior |
|---------------|----------|
| `halt-and-report` (default) | Stop at failed step, save state, resume possible |
| `continue` | Warn on failure, proceed to next step |

### Resume Flow

```
/pipeline resume
-> Scan /tmp/.claude-pipeline-*-$PPID.json
-> Show halted pipeline info
-> Options: Retry | Skip | Abort
```

### Output Format

```
[Pipeline] Starting release -- 3 steps
[Step 1/3] review -- Running...
[Step 1/3] review -- Done (12s)
[Step 2/3] test -- Running...
[Step 2/3] test -- Halted: 3 tests failed
[Pipeline] Halted at step 2/3 -- use /pipeline resume to continue
```

## File Structure (baekenough-skills)

```
pipeline/
├── SKILL.md              # Main skill (entry point + engine + resume + add/delete)
├── README.md             # English docs
└── README_ko.md          # Korean docs
```

Single SKILL.md design — runner and resume are internal logic, not separate skills. No `scripts/` directory needed since all logic is prompt-based.

## Pipeline Directory Convention

- Default: `workflows/` relative to project root
- Override: `--dir <path>` argument
- Scan: `*.yaml` files in the target directory

## Relationship to oh-my-customcode

This skill is extracted from oh-my-customcode's `workflow`, `workflow-runner`, and `workflow-resume` skills.

### What was removed

- `action:` step type (`implement`, `create-pr`) — replaced by `prompt:`
- Project-specific workflow definitions (auto-dev, eraser)
- oh-my-customcode rule references (R009, R010, R018)
- `omcustom:` command prefix

### Migration path (separate issue)

oh-my-customcode will migrate from internal workflow skills to this pipeline skill:

- Delete `workflow/`, `workflow-runner/`, `workflow-resume/` skills
- Install pipeline skill
- Convert `action:` steps in existing YAMLs to `prompt:` steps
- Update command references from `/omcustom:workflow` to `/pipeline`

## Design Decisions

1. **Sequential only** — DAG/parallel execution remains in oh-my-customcode's `dag-orchestration` skill
2. **`skill:` + `prompt:`** — Generic step types instead of hardcoded actions
3. **Single SKILL.md** — All logic in one file since skills.sh installs per-skill
4. **Natural language throughout** — condition, input, foreach, and add command all use natural language interpreted by the agent
5. **`pipeline` name** — More specific than "workflow", avoids collision with Vercel Workflow
