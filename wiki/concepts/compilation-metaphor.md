---
title: The Compilation Metaphor
type: concept
updated: 2026-04-12
sources:
  - CLAUDE.md
  - .claude/rules/MUST-agent-design.md
related:
  - [[separation-of-concerns]]
  - [[dynamic-creation]]
  - [[overview]]
  - [[skill-taxonomy]]
  - [[agent-taxonomy]]
---

# The Compilation Metaphor

oh-my-customcode's architecture is explicitly modeled on software compilation. This isn't a decorative analogy — it is the organizing principle that dictates where knowledge lives, how components evolve, and why the system scales cleanly.

## The Mapping

| Compilation Concept | oh-my-customcode | Role |
|---------------------|-----------------|------|
| **Source code** | `.claude/skills/` | Reusable, composable knowledge definitions |
| **Build artifacts** | `.claude/agents/` | Skills compiled into executable specialists |
| **Compiler** | `mgr-sauron` (R017) | Structural validation and consistency enforcement |
| **Build spec / constraints** | `.claude/rules/` | Behavioral rules agents must obey |
| **Linker** | Routing skills | Connects tasks to the right agent at runtime |
| **Standard library** | `guides/` | Shared reference docs available to all agents |

## Why This Metaphor Matters

### Independent Evolution

In software compilation, source code evolves independently of the runtime binary. You recompile to get updated artifacts. oh-my-customcode follows the same model:

- A `go-best-practices` skill can be updated with new Go idioms without touching `lang-golang-expert.md`
- The next time the agent is invoked, it loads the updated skill — effectively "recompiled"
- This prevents knowledge decay without requiring agent file maintenance

### Separation is Structural, Not Stylistic

The rule [[wiki/rules/r006]] enforces that agents MUST NOT contain detailed workflow instructions. Those belong in skills. Guides contain reference docs that skills may cite. This maps precisely to the prohibition on embedding documentation in source files or source code in specification files.

### Validation Before Deployment

Just as a compiler rejects invalid source code, `mgr-sauron` rejects structural changes that violate consistency:
- Missing required frontmatter fields
- Orphaned skill references (skills referenced by agents that don't exist)
- Routing table desynchronization
- Invalid memory scopes

No `git push` until the "build" passes.

### Runtime Linking

The compilation metaphor extends to execution time. Routing skills act as the linker: they take a user request (the "program to run") and resolve which agent (binary) to execute. The [[wiki/skills/intent-detection]] patterns are the symbol table — mapping keywords and file patterns to agent names.

Dynamic agent creation is analogous to just-in-time compilation: when no pre-built artifact exists, `mgr-creator` synthesizes one from available source materials (skills and guides) and caches it for reuse.

## Architectural Decisions Driven by the Metaphor

| Decision | Compilation Basis |
|----------|------------------|
| Skills are stateless | Source files don't contain runtime state |
| Agents reference skills by name | Binaries link to libraries by name, not by embedding |
| mgr-creator auto-discovers skills | Compiler discovers headers via include paths |
| R017 requires full rebuild verification | CI/CD requires full build before merge |
| Guides are not embedded in agents | Documentation is separate from compiled output |

## The "No Expert? Create One" Philosophy

The dynamic creation fallback is the system's most distinctive architectural choice. In traditional systems, missing functionality blocks the task. Here, the system generates new capability on demand:

1. Routing detects a domain with no matching agent (no pre-built binary)
2. `mgr-creator` searches skills and guides for the domain (finds source materials)
3. A new agent is created with proper frontmatter and skill references (compilation)
4. The agent is immediately available for the original task (execution)

This is JIT compilation for AI agent behavior.

## Relationships

- **Depends on**: [[overview]] (architecture context), [[wiki/rules/r006]] (enforcement)
- **Used by**: This metaphor underlies every other architecture and concept page
- **See also**: [[separation-of-concerns]], [[dynamic-creation]], [[skill-taxonomy]], [[agent-taxonomy]]

## Sources

- `CLAUDE.md` — compilation metaphor table, core philosophy statement
- `.claude/rules/MUST-agent-design.md` — R006 separation of concerns enforcement
