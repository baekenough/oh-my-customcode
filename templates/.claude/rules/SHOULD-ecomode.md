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

## Input Context Pruning

Active removal of irrelevant retrieved content from agent context. Complements output compression by managing the input side of token budget.

> **Terminology**: "Input Context Pruning" (R013) manages retrieved chunks during a task. "Memory Pruning" (R011) manages behavioral memory across sessions. These are distinct concepts.

### Pruning Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| Search overflow | Retrieved chunks > 10 | Retain top-K by relevance, prune rest |
| Context pressure | Context usage > 50% | Summarize oldest/lowest-relevance chunks |
| Multi-hop intermediate | Between retrieval hops | Replace previous hop raw results with summary |

### Pruning Strategy

| Strategy | When | Behavior |
|----------|------|----------|
| **Retain** | Directly relevant code/docs | Keep as-is |
| **Summarize** | Background context, prior hop results | Replace with 1-2 line summary |
| **Drop** | Search noise, duplicates, already-reflected info | Remove entirely |

### Rules

- Pruning is irreversible — generate summary BEFORE dropping original
- Prune at document/chunk level, not mid-sentence
- When in doubt, Summarize rather than Drop
- Track pruning decisions: `[Pruned] {N} chunks → {M} retained, {K} summarized, {J} dropped`

## Context Budget Management

Task-type-aware context thresholds that trigger ecomode earlier for context-heavy operations.

### Task Type Thresholds

| Task Type | Context Trigger | Rationale |
|-----------|----------------|-----------|
| Research (/research, multi-team) | 40% | High context consumption from parallel team results |
| Implementation (code generation) | 50% | Moderate context for code + test output |
| Review (code review, audit) | 60% | Moderate context for diff analysis |
| Management (git, deploy, CI) | 70% | Lower context needs |
| General (default) | 80% | Standard threshold |

### Detection

Task type is inferred from active context:
- **Research**: `/research` skill active, 4+ parallel agents
- **Implementation**: Write/Edit tools dominant, code files targeted
- **Review**: Read/Grep dominant, review/audit skill active
- **Management**: git/gh commands, CI/CD operations
- **General**: No specific pattern detected

### Budget Advisor Hook

The `context-budget-advisor.sh` hook monitors context usage and emits warnings when task-specific thresholds are approached:

```
[Context Budget] Task: research | Threshold: 40% | Current: 38%
[Context Budget] ⚠ Approaching budget limit — consider /compact or ecomode
```

### Integration

- Works with existing ecomode activation (R013)
- Does NOT override explicit user settings
- Advisory only — never blocks operations
- Context percentage from statusline data when available
