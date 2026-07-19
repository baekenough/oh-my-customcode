---
title: Omcustom Improve Report
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/omcustom-improve-report/SKILL.md
related:
  - [[omcustom-auto-improve]]
  - [[r010]]
  - [[r011]]
  - [[r016]]
---

# Omcustom Improve Report

Read-only report of improvement suggestions gathered by the eval-core analysis engine — no file modifications, no GitHub mutations.

## Overview

Checks that `eval-core` is installed (`command -v eval-core` or `node_modules/.bin/eval-core`), then runs `eval-core analyze --format markdown` and renders the output as structured markdown. Counts the sessions-recorded figure in the output metadata and prepends a confidence annotation: under 5 sessions → `[confidence: low]` with an explicit "최소 5세션 이상 필요" data-insufficiency notice, 5–20 → `[confidence: medium]`, over 20 → `[confidence: high]` shown without caveats. If eval-core isn't installed or its database is empty, it falls back silently to a "데이터 없음" message rather than erroring. Design intent: give the user a cheap, side-effect-free window into eval-core's routing-quality/skill-effectiveness/agent-usage signals before committing to the higher-cost, mutating [[omcustom-auto-improve]] pipeline — this skill only reads eval-core's own analysis, it does not aggregate harness-eval or sauron findings.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom-improve-report` (hyphenated — the frontmatter `name:` carries no colon; corrected from `/omcustom:improve-report` in #1469/v1.1.10 to fix a skill-name-vs-invocation-command namespace mismatch)
- **Effort**: not specified
- **Read-only**: no file modifications, no GitHub issue creation, no external mutations

## Relationships

- **Used by agents**: orchestrator (invoked directly as a user-facing slash command)
- **Upstream of**: [[omcustom-auto-improve]] — its own prerequisites instruct running this report first when the suggestion queue is empty
- **See also**: [[r010]] (read-only Bash only, no delegated writes required), [[r011]] (confidence-tiered reporting convention), [[r016]] (feeds the broader continuous-improvement loop that eval-core suggestions ultimately serve)

## Sources

- `.claude/skills/omcustom-improve-report/SKILL.md` — skill definition
