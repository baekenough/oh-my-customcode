---
name: action-validator
description: Pre-action boundary checking — validates agent tool calls against declared capabilities and task contracts
scope: core
user-invocable: false
---

# Action Validator Skill

## Purpose

Advisory pre-action validation layer that checks agent tool calls against declared capabilities, file access scope (R002), and task contracts before execution. Inspired by AutoHarness (Google DeepMind) — enforcing action-space legality at agent boundaries.

This skill does NOT block actions (R021 advisory-first model). It emits warnings when agents attempt operations outside their declared scope.

## Validation Checks

| Check | What | Against |
|-------|------|---------|
| Tool scope | Tool being called | Agent's `tools` frontmatter list |
| File scope | File path in Write/Edit | R002 file access rules |
| Domain scope | Target file extension | Agent's `domain` frontmatter |
| Task contract | Operation type | Task description constraints |

## Advisory Format

```
--- [Action Validator] Scope warning ---
  Agent: {agent-name}
  Tool: {tool-name}
  Target: {file-path}
  Issue: {description}
  Declared scope: {agent's declared tools/domain}
  💡 Suggestion: {recommended action}
---
```

## Integration Points

| System | How |
|--------|-----|
| PreToolUse hooks | Optional hook to check tool calls (advisory only) |
| pipeline-guards | Complements pipeline stage gates |
| adversarial-review | Provides action-space-legality criterion |
| R002 (Permissions) | Validates against declared file access rules |
| R010 (Orchestrator) | Orchestrator validates subagent scope claims |

## Policy Cache Pattern

For high-repetition agents (e.g., mgr-gitnerd commit workflows), capture validated decision paths as reusable policies:

```yaml
policy_cache:
  agent: mgr-gitnerd
  action: git-commit
  validated_steps:
    - tool: Bash
      pattern: "git add *"
      verdict: allow
    - tool: Bash
      pattern: "git commit *"
      verdict: allow
    - tool: Bash
      pattern: "git push *"
      verdict: warn_confirm
```

Policy caching reduces redundant LLM calls for well-understood workflows. Policies are advisory — the orchestrator may override.

## Scope

This skill is an advisory layer, not a hard enforcement mechanism:
- **Does**: Emit warnings, log scope violations, suggest corrections
- **Does NOT**: Block tool execution, modify agent behavior, override R021
- **Future**: May integrate with PreToolUse hooks for automated checking (see R021 promotion criteria)
