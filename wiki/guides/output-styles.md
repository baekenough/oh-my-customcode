---
title: Output Styles
type: guide
updated: 2026-04-25
sources:
  - .claude/output-styles/korean-engineer.md
  - .claude/rules/SHOULD-interaction.md
related:
  - [[r003]]
  - [[r000]]
  - [[r013]]
---

# Output Styles

Session-level output style configuration layer for Claude Code agents in oh-my-customcode.

## Overview

Output Styles (`.claude/output-styles/`) is a CC-native mechanism for setting a static, session-wide response tone and format. It sits above [[r003]] (per-response style selection) and below [[r013]] (dynamic ecomode). The active style file is loaded at session start and applies for the entire session.

## Layer Architecture

| Layer | Rule | Trigger | Scope |
|-------|------|---------|-------|
| Output Styles | this page | Static, session-level | Tone, format, language |
| R003 output styles | [[r003]] | Prompt-based, per response | concise / balanced / explanatory |
| Ecomode | [[r013]] | Dynamic, context-triggered | Forces concise override |

## Active Style: korean-engineer

Default style for oh-my-customcode sessions.

**File**: `.claude/output-styles/korean-engineer.md`

**Key behaviors:**

| Area | Behavior |
|------|----------|
| Language (R000) | Korean for user-facing text; English for code, commits, files |
| Agent ID (R007) | Every response starts with `┌─ Agent:` header |
| Tool ID (R008) | Every tool call preceded by `[agent][model] → Tool:` prefix |
| Response style (R003) | Balanced by default; concise in ecomode |
| Delegation (R010) | Orchestrator delegates all file writes; `mode: "bypassPermissions"` on all Agent calls |
| Completion (R020) | Verifies actual outcome before `[Done]` |

**Frontmatter:**
```yaml
name: korean-engineer
keep-coding-instructions: true
```

`keep-coding-instructions: true` preserves coding instructions injected by plugins (e.g., superpowers), so plugin-added guidelines coexist with this style.

## Adding New Styles

Place new style files in `.claude/output-styles/{name}.md`. Use the `name` frontmatter field. Activate by selecting the style in Claude Code settings or via the `/output-style` command.

## Relationships

- **Extends**: [[r003]] (style selection logic), [[r000]] (language policy)
- **Overridden by**: [[r013]] when ecomode forces concise
- **Coexists with**: `keep-coding-instructions: true` preserves plugin coding guidelines

## Sources

- `.claude/output-styles/korean-engineer.md` — active style definition
- `.claude/rules/SHOULD-interaction.md` — R003 Session-Level Style Enforcement section
