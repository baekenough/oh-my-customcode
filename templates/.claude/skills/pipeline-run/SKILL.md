---
name: pipeline-run
description: Execute a defined pipeline with sequential steps
argument-hint: "<pipeline-name> [--input key=value]"
disable-model-invocation: true
---

# Pipeline Execution Skill

Execute a defined pipeline with sequential steps, passing outputs between steps.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| pipeline-name | string | yes | Name of the pipeline to execute |

## Options

```
--input, -i      Input values (key=value format, repeatable)
--dry-run        Show steps without executing
--verbose, -v    Show detailed execution info
--continue       Continue from failed step (if pipeline was interrupted)
```

## Workflow

```
1. Load pipeline from pipelines/{name}.yaml or pipelines/examples/{name}.yaml
2. Validate pipeline structure
3. Process input parameters
4. Execute steps sequentially
5. Pass outputs between steps
6. Report final results
```

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

## Output Format

### Normal Execution
```
[pipeline:run code-review --input file_path=src/main.go]

┌─ Agent: secretary (orchestrator)
├─ Skill: pipeline-execution
└─ Task: Executing pipeline: code-review

[Pipeline] code-review
├── Input: file_path=src/main.go

[1/4] detect_language
      Agent: secretary
      Status: ✓ go

[2/4] analyze
      Agent: go-expert
      Status: ✓ 3 issues found

[3/4] security_check
      Agent: qa-lead
      Status: ✓ No vulnerabilities

[4/4] report
      Agent: arch-documenter
      Status: ✓ Report generated

[Complete] Pipeline finished successfully

Results:
├── language: go
├── issues: 3
├── security: clean
└── report: Review completed with 3 issues...
```

### Dry Run
```
[pipeline:run code-review --dry-run --input file_path=src/main.go]

[Pipeline] code-review (DRY RUN)

Steps to execute:
├── [1] detect_language → secretary.detect_language
│       Input: { file: "src/main.go" }
│       Output: → language

├── [2] analyze → ${language}-expert.analyze_code
│       Input: { file: "src/main.go", focus: "all" }
│       Output: → analysis

├── [3] security_check → qa-lead.security_review
│       Input: { file: "src/main.go", findings: ${analysis} }
│       Output: → security

└── [4] report → arch-documenter.generate_report
        Input: { file, language, analysis, security }
        Output: → report

No changes made (dry run).
```

### Error
```
[pipeline:run code-review --input file_path=missing.go]

[Pipeline Failed] code-review

Error at step 1: detect_language
├── Error: File not found: missing.go
├── Status: ✗ Failed
└── Steps completed: 0/4

Pipeline aborted. No partial results.
```

## Related

- pipeline-list - List available pipelines
