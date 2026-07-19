---
title: Claude Native
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/claude-native/SKILL.md
related:
  - [[mgr-claude-code-bible]]
  - [[update-external]]
  - [[claude-code-bible]]
  - [[claude-code]]
  - [[audit-agents]]
---

# Claude Native

Monitor Claude Code (the CLI tool) release history and auto-generate one GitHub issue per untracked version.

## Overview

Fetches Claude Code releases from `gh api repos/anthropics/claude-code/releases`, dedups against existing `Claude Code v{version}` issues (title-pattern search), and files a new issue per gap using a fixed template (release summary + a 4-item review checklist covering agent/rule impact, feature relevance, and version compatibility). Only versions >= `2.1.86` are in scope — monitoring resumed there after the deprecated customclaw Airflow-based watcher stopped (deprecated 2026-03-18); this skill fills that gap and is the successor mechanism. Default run checks only the latest 5 releases; `--backfill` scans the full paginated history; `--dry-run` reports without creating issues. Version compare is numeric semver (major.minor.patch) and explicitly does NOT assume contiguous patch numbers — CC skips some patches (e.g. v2.1.151, v2.1.155 never shipped), so the skill acts only on versions actually present in the API response.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/claude-native [--backfill] [--dry-run]`
- **Effort**: not specified

## Relationships

- **Feeds**: issues consumed by [[mgr-claude-code-bible]] (spec compliance) and [[update-external]] (agent/skill sync) review cycles
- **Related skills**: [[update-external]], [[claude-code-bible]], [[audit-agents]]
- **See also**: [[claude-code]] (guide referencing skill-generated issues), [[R016]] (continuous improvement — issues drive rule updates)
- **Integration paths**: manual slash command, SessionStart hook (`claude-native-check.sh` dry-run notify), or scheduled via `/schedule` / CronCreate MCP

## Sources

- `.claude/skills/claude-native/SKILL.md` — skill definition
