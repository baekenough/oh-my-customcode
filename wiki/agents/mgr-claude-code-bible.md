---
title: mgr-claude-code-bible
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/mgr-claude-code-bible.md
related:
  - [[mgr-sauron]]
  - [[mgr-creator]]
  - [[mgr-updater]]
  - [[r017]]
  - [[r011]]
---

# mgr-claude-code-bible

Authoritative source of truth for Claude Code specifications — fetches latest official docs from code.claude.com and validates agent/skill compliance against the official spec.

## Overview

`mgr-claude-code-bible` operates in two modes. In **Update mode**, it fetches and caches the latest Claude Code documentation (sub-agents.md, agent-teams.md, skills.md, hooks.md, plugins.md, settings.md, mcp-servers.md, model-config.md) from `https://code.claude.com/docs/llms.txt`, skipping if the local cache (`~/.claude/references/claude-code/last-updated.txt`) was updated within 24 hours. In **Verify mode**, it reads the cached docs, scans all `.claude/agents/*.md` and `.claude/skills/*/SKILL.md` files, and compares frontmatter against the official spec to generate ERROR (missing required)/WARNING (missing recommended)/INFO (non-standard) compliance reports.

This agent is invoked by [[mgr-sauron]] during Phase 1 verification ([[r017]]) as the "mgr-claude-code-bible:verify" check for official spec compliance.

## Key Details

- **Model**: claude-sonnet-5
- **Domain**: universal
- **Tools**: Read, Write, Grep, Bash
- **Skills**: `claude-code-bible`
- **Memory**: local (`.claude/agent-memory-local/mgr-claude-code-bible/`, git-untracked — changed from `project` in PR #1468 / v1.1.13)
- **Effort**: medium
- **Max Turns**: 20
- **Permission Mode**: bypassPermissions

## Official Frontmatter Reference

The agent's own compliance checks are anchored to this spec:

- **Agent**: `name`/`description` required; `model`, `tools`, `disallowedTools`, `skills`, `hooks`, `memory`, `permissionMode` optional/recommended.
- **Skill**: `name` required; `description`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `context`, `agent`, `hooks` optional.

## Verification Principles & Error Handling

Never hallucinate features absent from official docs; always cite the specific doc file; warn when local docs exceed 7 days old and force a re-fetch past 30 days. Verification also checks memory field values, Agent Teams compatibility, hooks event names, and deprecated patterns. On network failure it falls back to cached docs; on parse failure it skips the section and reports the gap.

## Verification Output

- **ERROR**: Missing required frontmatter fields
- **WARNING**: Missing recommended fields
- **INFO**: Non-standard or deprecated patterns

## Relationships

- **Depends on**: `claude-code-bible` skill, `~/.claude/references/claude-code/` cache
- **Used by**: [[mgr-sauron]] (Phase 1 official spec compliance check), [[r017]] verification workflow
- **See also**: [[mgr-sauron]] (full system verification), [[mgr-creator]] (agent creation), [[mgr-updater]] (external sync), [[r011]] (memory scope semantics)

## Sources

- `.claude/agents/mgr-claude-code-bible.md` — agent definition
