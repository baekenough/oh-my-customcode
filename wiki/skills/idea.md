---
title: Idea
type: skill
updated: 2026-10-06
sources:
  - .claude/skills/idea/SKILL.md
related:
  - [[scout]]
  - [[skills/deep-plan|deep-plan]]
  - [[skills/professor-triage|professor-triage]]
  - [[release-plan]]
---

# Idea

Analyze a natural language idea against the project codebase and return structured issue specs.

## Overview

Takes a free-form idea description, analyzes it against the current project structure, and returns a structured JSON block containing a feasibility assessment and ready-to-create issue specifications. Works in four phases: intent parsing, codebase analysis (Glob/Grep), sonnet-agent feasibility analysis, and JSON output. The output JSON is a stable contract consumed by downstream systems such as the builder-factory Discord bot.

## Key Details

- **Scope**: core
- **Version**: 1.0.0
- **User-invocable**: yes
- **Command**: `/idea`
- **Argument hint**: `<idea text>`

## Workflow

1. **Parse** — extract core intent from natural language input
2. **Analyze** — Glob and Grep current project structure; identify affected modules, patterns, and conflicts
3. **Assess** — spawn a sonnet agent for feasibility (pass `mode: "bypassPermissions"` for compatibility: required on CC < 2.1.212, ignored on 2.1.212+ where subagents inherit the parent session's permission mode; see R010 "Universal bypassPermissions"): scope, complexity (XS/S/M/L), dependencies, risks
4. **Output** — emit a fenced JSON block with `title`, `scope`, `estimatedIssues`, `details`, and `issueSpecs[]`

## Output Contract

```json
{
  "title": "concise feature title",
  "scope": "affected modules and files",
  "estimatedIssues": 3,
  "details": "2-3 sentence feasibility analysis",
  "issueSpecs": [
    {
      "title": "issue title",
      "body": "issue description with acceptance criteria",
      "labels": ["enhancement"]
    }
  ]
}
```

The JSON structure is a stable contract — field names must not change.

## Relationships

- **Used by agents**: orchestrator, builder-factory Discord bot
- **Related skills**: [[scout]], [[skills/deep-plan|deep-plan]], [[skills/professor-triage|professor-triage]], [[release-plan]]
- **See also**: [[R009]], [[R010]]

## Sources

- `.claude/skills/idea/SKILL.md` — skill definition
