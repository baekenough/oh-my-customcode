---
title: "Claude Code Guide"
type: guide
updated: 2026-05-15
sources:
  - guides/claude-code/01-overview.md
  - guides/claude-code/15-version-compatibility.md
related:
  - [[mgr-claude-code-bible]]
  - [[r010]]
  - [[r012]]
  - [[r013]]
---

# Claude Code Guide

Reference documentation for Claude Code capabilities, features, and API integration patterns.

## Overview

Covers Claude's advanced API features for building Claude Code-compatible applications and agents. Topics include the 1M token context window, Agent Skills, batch processing, citations, extended thinking, Files API, structured outputs, and tool use. Also documents built-in tools (Bash, code execution, computer use, MCP connector, web fetch/search). Used by `mgr-claude-code-bible` for spec compliance verification.

## Key Topics

- Core features: context window, batch processing, prompt caching, structured outputs
- Tool integrations: Bash, code execution, computer use, text editor, web fetch/search
- Agent Skills and custom skill creation
- MCP connector and remote server integration
- Extended thinking for complex reasoning tasks
- Citations and search results for RAG applications
- Token counting and effort control

## Version Compatibility

oh-my-customcode v0.107.0+ targets CC v2.1.116+. See `guides/claude-code/15-version-compatibility.md` for full per-version notes.

### v2.1.142 (2026-05-14) — Key Changes

> Issue: #1158

- **`claude agents` new flags**: `--add-dir`, `--settings`, `--mcp-config`, `--plugin-dir`, `--permission-mode`, `--model`, `--effort`, `--dangerously-skip-permissions` — enables CLI-level override of R006 agent frontmatter values. Useful for CI/unattended R010 bypassPermissions flows.
- **Fast Mode default model → Opus 4.7**: `model: opus` agents + Fast Mode now use Opus 4.7. Pin with `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE=1` if needed.
- **Plugin root-level SKILL.md**: `SKILL.md` at plugin root (no `skills/` subdir) now exposes as skill — no impact on oh-my-customcode's `.claude/skills/<name>/SKILL.md` pattern.
- **`MCP_TOOL_TIMEOUT` fix**: Now correctly raises per-request fetch timeout for remote HTTP/SSE MCP servers (was capped at 60s). Relevant for R011 `claude-mem` / R019 `ontology-rag` timeout issues.
- **BG + git worktree Edit fix**: Background sessions can now edit files in existing git worktrees — stabilizes R009 parallel worktree workflows.
- **BG macOS sleep/wake fix**: Background sessions survive macOS sleep/wake — improves R018 Agent Teams long-running session stability.
- **`--dangerously-skip-permissions` retention**: Persists across retire/wake cycles — R010 unattended execution more reliable.

**Action items**: Confirm Fast Mode Opus 4.7 impact; set `MCP_TOOL_TIMEOUT` if needed for MCP server latency.

### v2.1.141 (2026-05-13) — Key Changes

> Issue: #1137

- **`/bg` permission mode preservation**: Background agents (`/bg` or `←←`) now retain current session's permission mode — `bypassPermissions` no longer drops on detach. R010 universal bypassPermissions on Agent tool calls still required.
- **Hook `terminalSequence` field**: Hooks can emit window title changes or terminal bells without terminal control — R012 HUD complement.
- **`claude agents --cwd <path>`**: Filter session list by directory — reduces noise in multi-project R009 monitoring.
- **Rewind "Summarize up to here"**: Manual context compression complementing R013 ecomode.

### Earlier Versions

See `guides/claude-code/15-version-compatibility.md` for v2.1.117–v2.1.140 notes.

## Known Limitations

### `.gitignore` Nested `.md` Pattern (#1147)

```gitignore
docs/superpowers/plans/*
!docs/superpowers/plans/*.md
```

This pattern tracks only **direct-child** `.md` files. Git semantics prevent `!` negation patterns from working inside already-excluded (`*`) parent directories. Nested paths like `docs/superpowers/plans/subdir/plan.md` are not tracked. **Current impact**: none — `release-plan` skill only creates flat-path plans. Fix if nested tracking is needed: add explicit `!docs/superpowers/plans/<subdir>/*.md` lines.

## Relationships

- **Used by agents**: [[mgr-claude-code-bible]]
- **Related skills**: [[claude-native]]
- **See also**: [[skill-bundle-design]], [[hook-data-flow]], [[r010]], [[r012]]

## Sources

- `guides/claude-code/01-overview.md` — feature overview, tool catalog, API capabilities
- `guides/claude-code/15-version-compatibility.md` — per-version compatibility notes (v2.1.117–v2.1.142)
