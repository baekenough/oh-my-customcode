---
name: stuck-recovery
description: Detect stuck loops and advise recovery strategies
scope: core
user-invocable: false
---

# Stuck Recovery Skill

Detects when tasks are stuck in repetitive failure loops and advises recovery strategies. **Advisory-only** — the orchestrator decides the action (R010).

## Detection Signals

| Signal | Pattern | Threshold |
|--------|---------|-----------|
| Repeated error | Same error message appears 3+ times | 3 occurrences |
| Edit loop | Same file edited 3+ times in sequence | 3 edits |
| Agent retry | Same agent_type fails 3+ times consecutively | 3 failures |
| Tool loop | Same tool called 5+ times with similar input | 5 calls |

## Recovery Strategies

| Strategy | When | Action |
|----------|------|--------|
| Fresh context | Repeated same error | Suggest rephrasing the task |
| Model escalation | Agent retry loop | Trigger model-escalation advisory |
| Alternative approach | Edit loop detected | Suggest different file/method |
| Human intervention | All automated strategies exhausted | Ask user for guidance |
| Context reset | Long-running task (>30min) or context >80% | Structured handoff: save state to memory, create fresh session with task summary |

## Architecture

```
PostToolUse (Edit, Write, Bash, Task) → stuck-detector.sh
  Tracks: tool_name, file_path, error_hash, agent_type
  Storage: /tmp/.claude-tool-history-$PPID (JSON lines, max 100)
  Detection: sliding window pattern matching
  Output: stderr advisory when loop detected
```

## Advisory Format

```
--- [Stuck Detection] Loop detected ---
  Signal: {signal_type}
  Pattern: {description}
  Occurrences: {count}/{threshold}
  💡 Recovery: {suggested_strategy}
---
```

## Integration

- Complements model-escalation skill (escalation is one recovery strategy)
- Respects R010 (advisory only, orchestrator decides)
- Uses same PPID-scoped temp file pattern as other hooks
- Works with task-outcome-recorder.sh data when available

## Context Reset Strategy

For long-running tasks (>30 minutes) or when context usage exceeds 80%, context reset is preferred over compaction:

1. **Save state**: Write current progress, decisions, and open items to native auto-memory
2. **Create handoff**: Generate structured task summary with:
   - Completed steps and their outcomes
   - Current step and its state
   - Remaining steps
   - Key decisions made and their rationale
3. **Reset**: Start fresh session with handoff document as input

Context reset preserves decision quality by avoiding the information loss inherent in compaction. Based on Anthropic's finding that models experience "context anxiety" — prematurely concluding tasks due to perceived token limits.

### When to Use

| Condition | Strategy |
|-----------|----------|
| Context < 60% | Continue normally |
| Context 60-80% | Consider `/compact` |
| Context > 80% OR duration > 30min | Context reset recommended |
| Repeated compaction in same session | Context reset required |
