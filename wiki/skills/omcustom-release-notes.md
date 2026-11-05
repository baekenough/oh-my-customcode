---
title: Omcustom Release Notes
type: skill
updated: 2026-11-05
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

## File-Based Apply

The orchestrator hands the generated notes text to mgr-gitnerd, which writes it with its Write tool to a delegation-unique, git-ignored notes file and pass its path using `--notes-file` for release creation or editing. Never inline notes containing shell syntax. The tracked `release_notes.md` remains a review output and is not the apply input. See [source skill](../../.claude/skills/omcustom-release-notes/SKILL.md), [[pipeline]], and [[r010]].

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[release-plan]], [[mgr-gitnerd]]
- **See also**: [[R020]]

## Sources

- `.claude/skills/omcustom-release-notes/SKILL.md` — skill definition
- Content-drift resync 2026-11-05 (v2.0.14, #1906 A-3): the source now states that the notes file is written by mgr-gitnerd with its Write tool (Direct, File and Update apply paths); the orchestrator hands over the notes text and does not write the file itself (R010 "Exception: Simple Tasks").
