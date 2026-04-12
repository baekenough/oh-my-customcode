---
title: NPM Audit
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/npm-audit/SKILL.md
related:
  - [[tool-npm-expert]]
  - [[cve-triage]]
  - [[npm-publish]]
---

# NPM Audit

Audit npm dependencies for security vulnerabilities and outdated packages.

## Overview

Runs `npm audit` and `npm outdated`, analyzes results, and presents actionable remediation steps. Categorizes findings by severity (critical/high/moderate/low), identifies direct vs. transitive vulnerabilities, and suggests upgrade paths. Integrates with `cve-triage` for detailed CVE analysis of critical findings. Used by `tool-npm-expert`.

## Key Details

- **Scope**: package
- **User-invocable**: yes
- **Command**: `/omcustom:npm-audit`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[tool-npm-expert]]
- **Related skills**: [[cve-triage]], [[npm-publish]], [[npm-version]]
- **See also**: [[R001]]

## Sources

- `.claude/skills/npm-audit/SKILL.md` — skill definition
