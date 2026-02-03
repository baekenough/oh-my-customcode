---
name: pipeline-execution
description: Execute declarative pipelines with sequential steps
---

## Purpose

Execute declarative pipelines with variable passing between sequential steps.

## Capabilities

1. Load and validate pipeline definitions
2. Execute steps sequentially
3. Pass outputs as inputs to subsequent steps
4. Handle errors according to pipeline policy
5. Report progress and final results

## Execution Flow

```
1. Load Pipeline Definition
   └── Validate YAML structure

2. Process Inputs
   └── Resolve input variables

3. Execute Steps (sequential)
   For each step:
   ├── Resolve input variables (${var})
   ├── Invoke agent with action
   ├── Capture output
   ├── Handle errors
   └── Store output for next steps

4. Report Results
   └── Aggregate and format output
```

## Variable Resolution

### Input Variables

```yaml
input:
  file: "${file_path}"      # From pipeline inputs
  data: "${step_1.result}"  # From previous step
  config: "${inputs.config}" # Explicit input reference
```

### Resolution Order

1. Pipeline inputs (`${inputs.*}`)
2. Previous step outputs (`${step_id}` or `${step_id.field}`)
3. Environment variables (`${env.VAR}`) - if enabled

## Step Execution

### Normal Execution

```
[Pipeline] code-review
├── [1/4] detect_language...
│   └── Agent: secretary
│   └── Action: detect_language
│   └── Input: { file: "src/main.go" }
│   └── Output: "go"
│   └── Status: ✓
```

### Error Handling

```yaml
on_error: stop      # Stop pipeline, report error
on_error: continue  # Log warning, continue to next step
on_error: retry     # Retry with backoff
```

### Retry Configuration

```yaml
retry:
  max_attempts: 3
  delay: 1000        # ms
  backoff: exponential  # linear | exponential
```

## Output Format

### Progress Updates

```
[Pipeline] code-review (2/4)
├── [1/4] detect_language: ✓ go
├── [2/4] analyze: ⏳ Running...
├── [3/4] security_check: ⏳ Pending
└── [4/4] report: ⏳ Pending
```

### Completion

```
[Pipeline Complete] code-review

Results:
├── language: go
├── analysis: { issues: 3, suggestions: 5 }
├── security: { vulnerabilities: 0 }
└── report: "Review completed..."

Total: 4 steps, 0 failures
```

### Error Report

```
[Pipeline Failed] code-review

Failed at step 2: analyze
├── Error: Agent not found: xyz-expert
├── Input: { file: "src/main.go" }
└── Steps completed: 1/4

Partial results available in ${partial_results}
```

## Integration

### With Secretary

```yaml
secretary:
  - Receives pipeline:run command
  - Loads pipeline definition
  - Uses this skill for execution
  - Reports results to user
```

### With Ecomode

```yaml
ecomode_active:
  - Compact progress updates
  - Summary-only final output
  - Skip verbose step details
```

## Validation Rules

### Pipeline Structure

```yaml
required:
  - name: string
  - steps: array (min 1)

optional:
  - description: string
  - inputs: array
  - error_handling: object
  - metadata: object
```

### Step Structure

```yaml
required:
  - id: string (unique)
  - agent: string
  - action: string

optional:
  - input: object
  - output: string
  - on_error: stop | continue | retry
  - retry: object
  - description: string
```

## Error Codes

| Code | Meaning |
|------|---------|
| PIPELINE_NOT_FOUND | Pipeline file doesn't exist |
| INVALID_PIPELINE | YAML structure invalid |
| MISSING_INPUT | Required input not provided |
| STEP_FAILED | Step execution failed |
| AGENT_NOT_FOUND | Specified agent doesn't exist |
| VARIABLE_UNRESOLVED | Variable reference couldn't be resolved |
