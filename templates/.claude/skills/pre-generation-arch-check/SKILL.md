---
name: pre-generation-arch-check
description: Pre-generation architecture check — detect R006 separation-of-concerns and compilation metaphor violations before code generation begins
scope: core
user-invocable: false
version: 1.0.0
---

# Pre-Generation Architecture Check

AASM-inspired pre-generation architecture guard. Detects design violations before code generation (the "pre-compile lint" phase), complementing adversarial-review and deep-verify which operate post-generation.

## Overview

This skill fills the PRE-generation gap in the verification pipeline:

| Phase | Skill | When |
|-------|-------|------|
| Pre-generation | **pre-generation-arch-check** | Before code is written |
| Post-generation | adversarial-review | After code is written |
| Post-generation | deep-verify | After changes are committed |

Inspired by Contexty's AASM (AI Anti-pattern Severity Matrix) mechanism. Detects when a requested change might violate:
- R006 separation of concerns (agents vs skills vs guides)
- Compilation metaphor boundaries (source/build/spec/linker/stdlib)
- R010 orchestrator delegation rules
- Protected path rules (.claude/agents/, .claude/skills/, guides/)

## Input

- **Request summary**: What the user or pipeline is asking to generate
- **Target files/paths**: Where changes will be made

## Processing — Anti-Pattern Detection

Check for each of the following anti-patterns against the request summary and target paths:

### 1. Skill-in-Agent (WARN)
An agent file (`.claude/agents/*.md`) body contains detailed step-by-step instructions, scripts, or workflow logic that belongs in a skill file.
- **Signal**: Agent body exceeds ~50 lines OR contains code blocks / numbered step sequences
- **Suggestion**: Extract instructions into `.claude/skills/{name}/SKILL.md`, reference from agent `skills:` frontmatter

### 2. Agent-in-Skill (WARN)
A skill file contains agent configuration fields (`model:`, `tools:`, `memory:`, `permissionMode:`).
- **Signal**: Proposed skill SKILL.md frontmatter contains agent-only fields
- **Suggestion**: Move agent configuration to `.claude/agents/{name}.md`; keep skill focused on instructions

### 3. Guide-in-Skill (WARN)
A skill file contains reference documentation, best-practices tutorials, or conceptual explanations that belong in `guides/`.
- **Signal**: Proposed SKILL.md body contains "## Background", "## Concepts", or sections > 100 lines of prose
- **Suggestion**: Move reference content to `guides/{topic}/`, link from skill

### 4. Cross-Concern Write Without mgr-creator (BLOCK)
A single atomic change spans two or more of: `.claude/agents/`, `.claude/skills/`, `guides/` — without routing through mgr-creator.
- **Signal**: Target paths include files in 2+ protected directories in the same request
- **Suggestion**: Route the request through mgr-creator (R010 protected path rule)

### 5. Direct Orchestrator Write (BLOCK)
An implementation step would have the orchestrator (main conversation) directly write or edit files, bypassing subagent delegation.
- **Signal**: Request implies "I will write X" from orchestrator context rather than "delegate to specialist"
- **Suggestion**: Delegate file writes to appropriate specialist agent per R010 delegation table

### 6. Spec-Build Confusion (WARN)
Rules (`.claude/rules/`) are being modified in the same atomic change as source code or agent/skill files.
- **Signal**: Target paths include both `.claude/rules/*.md` and any code or `.claude/agents/` or `.claude/skills/` files
- **Suggestion**: Separate rule updates (spec changes) from agent/skill/code changes (build changes) into distinct commits

## Output Format

When no violations are detected:

```
[ARCH-CHECK] No violations detected — proceed with generation
```

When violations are detected:

```
[ARCH-WARNING] {count} potential violation(s) detected:
├── {pattern-name} ({severity}): {description}
│   └── Suggestion: {fix}
├── {pattern-name} ({severity}): {description}
│   └── Suggestion: {fix}
```

## Severity Levels

| Severity | Action |
|----------|--------|
| WARN | Advisory — proceed with caution, note in generation plan |
| BLOCK | Halt — requires architectural redesign before proceeding |

BLOCK violations must be resolved before generation continues. WARN violations are logged and surfaced to the user but do not halt execution (consistent with R021 advisory-first enforcement model).

## Integration

Auto-invoked at structured-dev-cycle Phase 1 (planning phase) before any file generation begins.

This skill is advisory only — it does NOT hard-block execution. This is consistent with R021's advisory-first enforcement model. Future promotion to a PreToolUse hook is possible if violation rates warrant escalation.

Invocation pattern:
```
[structured-dev-cycle Phase 1]
  → pre-generation-arch-check
    → returns [ARCH-CHECK] or [ARCH-WARNING]
  → continue to Phase 2 (generation) with findings surfaced
```

## Cross-References

- `.claude/rules/MUST-agent-design.md` (R006) — separation of concerns
- `.claude/rules/MUST-orchestrator-coordination.md` (R010) — protected paths and delegation
- `.claude/skills/adversarial-review/` — post-generation security counterpart
- `.claude/skills/deep-verify/` — post-generation quality counterpart
- Source concept: Contexty AASM (https://github.com/ttalkkak-lab/opencode-contexty)
