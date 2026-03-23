---
name: omcustom:workflow
description: Invoke YAML-defined workflows by name — /omcustom:workflow omcustom-dev runs the full pipeline
scope: harness
user-invocable: true
effort: high
argument-hint: "<workflow-name> | (no args to list available)"
---

# /omcustom:workflow — Workflow Invocation

## Usage

```
/omcustom:workflow omcustom-dev     # Run the omcustom-dev workflow
/omcustom:workflow                  # List available workflows
/omcustom:workflow:resume           # Resume a halted workflow
```

## Behavior

### List Mode (no arguments or --list flag)

Execute these steps to display available workflows:

1. **Scan built-in workflows**: Use `Glob("workflows/*.yaml")` (NOT templates/) to find all workflow definitions
2. **Extract metadata**: For each YAML file found, use `Bash` to extract name and description:
   ```bash
   for f in workflows/*.yaml; do
     name=$(grep -m1 '^name:' "$f" | sed 's/^name: *//' | tr -d '"')
     desc=$(grep -m1 '^description:' "$f" | sed 's/^description: *//' | tr -d '"')
     echo "  $name — $desc"
   done
   ```
3. **Scan template workflows**: Use `Glob("templates/workflows/*.yaml")` for template examples
4. **Extract template metadata**: Same extraction as step 2 for `templates/workflows/*.yaml`
5. **Display formatted output**:
   ```
   Available workflows:
     {name} — {description}
     {name} — {description}

   Template workflows (in templates/workflows/):
     {name} — {description}
   ```
6. If no workflows found, display: "No workflows found in workflows/ directory."
7. If YAML parsing fails for a file, skip it and show: `  {filename} — (parse error, skipped)`

### Run Mode (with workflow name)

1. Validate workflow exists: `workflows/{name}.yaml`
2. Load and validate YAML structure
3. Announce: `[Workflow] Starting {name} — {step_count} steps`
4. Invoke workflow-runner skill with the loaded definition
5. Report completion or failure

### Resume Mode (/omcustom:workflow:resume)

1. Check for state file: `/tmp/.claude-workflow-*-{PPID}.json`
2. If found: show halted workflow name and failed step
3. Ask: "Resume from step {N} ({step_name})?"
4. Re-invoke workflow-runner from the failed step

## Error Handling

- Workflow not found → list available workflows with suggestion
- YAML parse error → report with line number
- Step failure → halt-and-report per workflow error policy
