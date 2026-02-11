# [SHOULD] Ecomode Rules

> **Priority**: SHOULD | **ID**: R013

## Activation

Auto-activates when: 4+ parallel tasks, batch operations, 80%+ context usage, or explicit "ecomode on".

## Behaviors

**Compact Output**: Agents return `status + summary (1-2 sentences) + key_data only`. Skip intermediate steps, verbose explanations, repeated context, full file contents.

**Aggregation Format**:
```
[Batch Complete] {n}/{total}
├── {agent}: ✓/✗/⚠ {summary}
```

**Compression**: File lists -> count only (unless < 5), error traces -> first/last 3 lines, code -> path:line ref only.

## Config

```yaml
ecomode:
  threshold: 4
  result_format: summary
  max_result_length: 200
```

## Example

Normal: Full agent header + step-by-step analysis + detailed results.
Ecomode: `[lang-golang-expert] ✓ src/main.go reviewed: 1 naming issue (handle_error -> handleError)`

## Override

Disable with: "ecomode off", "verbose mode", or "show full details".
