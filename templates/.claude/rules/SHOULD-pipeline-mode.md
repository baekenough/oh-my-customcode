# [SHOULD] Pipeline Mode Rules

> **Priority**: SHOULD - Recommended for sequential workflows
> **ID**: R014

## Purpose

Enable declarative, sequential multi-step workflows with variable passing between steps.

## Pipeline Definition Format

```yaml
name: pipeline-name
description: What this pipeline does

inputs:
  - name: input_name
    required: true
    description: Input description

steps:
  - id: step_1
    agent: agent-name
    action: action_name
    input: { key: "${input_name}" }
    output: result_variable

  - id: step_2
    agent: another-agent
    action: action_name
    input: { data: "${result_variable}" }
    output: final_result
```

## Variable Syntax

- `${variable}`: Reference input or previous step output
- `${step_id.field}`: Reference specific field from step output
- `${inputs.name}`: Explicit input reference

## Execution Rules

### Sequential by Default

Steps execute in order. Each step waits for previous step completion.

```
Step 1 → complete → Step 2 → complete → Step 3
```

### Output Passing

Output from step N is available to step N+1 and beyond.

```yaml
steps:
  - id: analyze
    output: analysis    # Creates ${analysis}

  - id: review
    input: { data: "${analysis}" }  # Uses ${analysis}
```

### Error Handling

```yaml
error_handling:
  default: stop              # stop | continue | retry

steps:
  - id: risky_step
    on_error: continue       # Override for this step
    retry:
      max_attempts: 3
      delay: 1000
```

## Pipeline Commands

| Command | Description |
|---------|-------------|
| `pipeline:run <name>` | Execute a pipeline |
| `pipeline:list` | List available pipelines |
| `pipeline:status` | Show running pipeline status |

## Pipeline Locations

```
pipelines/
├── index.yaml              # Pipeline registry
├── templates/              # Pipeline templates
│   └── pipeline-template.yaml
└── examples/               # Example pipelines
    └── code-review.yaml
```

## Example Pipeline

### code-review.yaml

```yaml
name: code-review
description: Full code review workflow

inputs:
  - name: file_path
    required: true

steps:
  - id: detect_language
    agent: secretary
    action: detect_language
    input: { file: "${file_path}" }
    output: language

  - id: analyze
    agent: "${language}-expert"
    action: analyze
    input: { file: "${file_path}" }
    output: analysis

  - id: security_check
    agent: qa-lead
    action: security_review
    input: { findings: "${analysis}" }
    output: security

  - id: report
    agent: arch-documenter
    action: summarize
    input:
      analysis: "${analysis}"
      security: "${security}"
    output: report
```

## Execution Output

```
[Pipeline] code-review
├── [1/4] detect_language: ✓ Go detected
├── [2/4] analyze: ✓ 5 issues found
├── [3/4] security_check: ✓ No vulnerabilities
└── [4/4] report: ✓ Summary generated

[Complete] Pipeline finished successfully
Output: ${report}
```

## Secretary Integration

Secretary can:
1. Load and validate pipeline definitions
2. Execute pipelines step-by-step
3. Pass variables between steps
4. Report progress and results
5. Handle errors according to policy

## Benefits

1. **Reproducibility**: Same workflow, consistent results
2. **Composability**: Build complex workflows from simple steps
3. **Visibility**: Clear step-by-step progress
4. **Error Recovery**: Defined error handling per step
5. **Reusability**: Save and reuse common workflows
