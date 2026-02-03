---
name: pipeline-list
description: List all available pipelines
argument-hint: "[--verbose] [--templates]"
---

# Pipeline List Skill

List all available pipelines with optional detailed information.

## Options

```
--verbose, -v    Show detailed info including steps
--templates      Include templates in list
```

## Output Format

### Standard
```
[pipeline:list]

Available Pipelines:

| Name | Description | Steps |
|------|-------------|-------|
| code-review | Full code review workflow | 4 |

Templates:

| Name | Description |
|------|-------------|
| pipeline-template | Base template for creating pipelines |

Use "pipeline:run <name>" to execute a pipeline.
Use "pipeline:list --verbose" for detailed info.
```

### Verbose
```
[pipeline:list --verbose]

Available Pipelines:

## code-review
Description: Full code review workflow with automatic language detection
Location: pipelines/examples/code-review.yaml
Steps: 4

Inputs:
  - file_path (required): Path to the file to review
  - focus (optional): Focus area (style, security, performance, all)

Steps:
  1. detect_language → secretary
  2. analyze → ${language}-expert
  3. security_check → qa-lead
  4. report → arch-documenter

---

Templates:

## pipeline-template
Description: Base template for creating new pipelines
Location: pipelines/templates/pipeline-template.yaml

Use as starting point for new pipelines.
```

## Related

- pipeline-run - Execute a pipeline
