---
title: Omcustom Release Notes
type: skill
updated: 2026-11-09
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

## CHANGELOG Promotion and Backfill

Phase 5 (promoting `## [Unreleased]` into a versioned section) and Backfill Mode (bulk history generation) both start with a deprecated-CHANGELOG precondition: count the lines matching `^## \[Deprecated` in CHANGELOG.md. A count of 1 or more means the CHANGELOG is deprecated (this repository, since v1.1.14, #1503), so both are skipped and CHANGELOG.md is not edited. A count of 0 means the CHANGELOG is maintained and they may run. A missing CHANGELOG.md yields no count, which also means skip.

Actors follow [[r010]] Root Meta-File Delegation: [[arch-documenter]] edits CHANGELOG.md; [[mgr-gitnerd]] commits, and for Backfill runs the script with `--output` pointing at a file other than CHANGELOG.md. The orchestrator runs neither. In the release flow, Phase 5 is skipped when the CHANGELOG is deprecated.

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[release-plan]], [[mgr-gitnerd]]
- **See also**: [[R020]]

## Sources

- `.claude/skills/omcustom-release-notes/SKILL.md` — skill definition
- Content-drift resync 2026-11-05 (v2.0.14, #1906 A-3): the source now states that the notes file is written by mgr-gitnerd with its Write tool (Direct, File and Update apply paths); the orchestrator hands over the notes text and does not write the file itself (R010 "Exception: Simple Tasks").
- Content-drift resync 2026-11-06 (v2.0.16): Phase 5 and Backfill Mode gained the deprecated-CHANGELOG precondition (count of 1 or more skips; missing CHANGELOG.md skips) and named actors (arch-documenter edits CHANGELOG.md; mgr-gitnerd runs the backfill script with `--output` and commits).
- Content-drift resync 2026-11-09 (v2.0.18, #1917): the source `### Output` citation of `scripts/backfill_changelog.py` dropped its line numbers and keeps the content anchor; the page never cited those lines, so only `updated` changed.
