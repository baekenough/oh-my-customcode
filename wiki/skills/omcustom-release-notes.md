---
title: Omcustom Release Notes
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/omcustom-release-notes/SKILL.md
related:
  - [[mgr-gitnerd]]
  - [[release-plan]]
  - [[deep-verify]]
---

# Omcustom Release Notes

Generate structured release notes from git history and closed issues.

## Overview

Generates release notes by reading git log between two refs and fetching closed GitHub issues. Organizes changes into sections: Breaking Changes, New Features, Bug Fixes, Improvements, and Internal. Supports conventional commit parsing and issue label filtering. Output formatted for GitHub Releases. Delegates git operations to `mgr-gitnerd`.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom-release-notes`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[release-plan]], [[mgr-gitnerd]]
- **See also**: [[R020]]

## Sources

- `.claude/skills/omcustom-release-notes/SKILL.md` — skill definition
