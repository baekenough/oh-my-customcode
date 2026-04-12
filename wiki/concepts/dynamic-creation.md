---
title: Dynamic Agent Creation
type: concept
updated: 2026-04-12
sources:
  - CLAUDE.md
  - .claude/rules/MUST-orchestrator-coordination.md
  - .claude/rules/MUST-agent-design.md
related:
  - [[compilation-metaphor]]
  - [[separation-of-concerns]]
  - [[orchestration]]
  - [[wiki/agents/mgr-creator]]
  - [[wiki/rules/r006]]
  - [[wiki/rules/r010]]
---

# Dynamic Agent Creation

When no existing specialist matches a task, oh-my-customcode generates one on demand. This "no expert? create one" philosophy is the system's most distinctive capability — routing degradation never results in a hard failure.

## Overview

Dynamic creation is the routing fallback. It activates when `dev-lead-routing`, `secretary-routing`, `de-lead-routing`, or `qa-lead-routing` cannot find a matching agent for the incoming task. Instead of returning a "no match" error, the orchestrator delegates to [[wiki/agents/mgr-creator]] with the detected context.

## The Creation Pipeline

```
Routing detects no match
  → Orchestrator delegates to mgr-creator with:
      - Detected domain keywords
      - File patterns found in codebase
      - Required capabilities inferred from task

  → mgr-creator:
      1. Search .claude/skills/ for relevant skills
      2. Search guides/ for relevant reference docs
      3. Research authoritative external references (if needed)
      4. Create .claude/agents/{name}.md with valid R006 frontmatter
      5. Link discovered skills in frontmatter

  → Orchestrator uses new agent for original task
```

The new agent is immediately available. No registry update, no restart — Claude Code discovers agents by scanning `.claude/agents/` at runtime.

## R006 Frontmatter Validation

Every agent created by `mgr-creator` must include valid frontmatter per [[wiki/rules/r006]]:

**Required fields**:
```yaml
name: agent-name       # Unique kebab-case identifier
description: ...       # One-line summary
model: sonnet          # haiku | sonnet | opus | opusplan
tools: [Read, Write, ...]
```

**Commonly added optional fields**:
```yaml
memory: project        # Enable persistent memory
effort: high           # Task complexity allocation
skills: [skill-1, skill-2]  # Auto-discovered skills
domain: backend        # For routing classification
```

Missing required fields cause R017 verification failures. mgr-creator validates frontmatter before writing.

## Auto-Discovery of Skills and Guides

`mgr-creator` uses a three-pass discovery:

1. **Keyword match**: Scan `SKILL.md` files for domain keywords from the task context
2. **File pattern match**: Check if skill `paths` fields match codebase files
3. **Guide search**: Find `guides/` directories relevant to the domain

This auto-discovery implements the [[compilation-metaphor]] principle: `mgr-creator` is the compiler finding header files via include paths.

## mgr-creator Operating Modes

| Mode | Trigger | Confirmation | Thoroughness |
|------|---------|-------------|-------------|
| **Explicit** | `/omcustom:create-agent` | User-guided | Full 3-phase workflow, 25 turns |
| **Dynamic** | Routing no-match fallback | None (immediate) | Minimal viable agent, focused discovery |

Dynamic mode creates a functional agent quickly. Explicit mode creates a fully researched, production-quality agent with external reference documentation.

## Why This Approach Over Static Registries

Traditional agent systems require manual registration: if a domain isn't pre-configured, the system fails. Dynamic creation inverts this: the absence of a specialist is a trigger for creation, not a failure.

Benefits:
- **Zero friction for new domains**: No configuration file updates needed
- **Knowledge-connected**: New agents automatically inherit relevant skills and guides
- **R006-compliant**: mgr-creator enforces the same standards as manually created agents
- **Reusable**: Created agents persist — the same agent handles future similar tasks

## Protected Path Enforcement

Dynamic creation always goes through `mgr-creator`. Direct writes to `.claude/agents/*.md` by the orchestrator or other agents violate [[wiki/rules/r010]] Protected Paths. This enforcement ensures:
- All agents have valid frontmatter (mgr-sauron won't block pushes)
- Skill references are valid (no orphaned skill pointers)
- Routing tables stay synchronized (routing skills discover agents correctly)

## Relationships

- **Depends on**: [[wiki/agents/mgr-creator]] (execution), [[wiki/rules/r006]] (frontmatter validation), [[wiki/rules/r010]] (protected paths)
- **Used by**: All four routing skills (fallback path), [[orchestration]]
- **See also**: [[compilation-metaphor]] (JIT compilation analogy), [[separation-of-concerns]] (triad creation)

## Sources

- `CLAUDE.md` — dynamic creation workflow, core philosophy statement
- `.claude/rules/MUST-orchestrator-coordination.md` — R010 protected paths and no-match fallback
- `.claude/rules/MUST-agent-design.md` — R006 required frontmatter fields
