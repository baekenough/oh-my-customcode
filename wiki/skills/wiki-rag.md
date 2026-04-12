---
title: Wiki RAG
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/wiki-rag/SKILL.md
related:
  - [[wiki]]
  - [[wiki-curator]]
---

# Wiki RAG

Use the project wiki as a RAG knowledge source — search wiki pages to answer codebase questions before exploring raw files.

## Overview

When users ask about project architecture, agent roles, or rule behavior, wiki-rag searches wiki/index.yaml for relevant pages, reads them in parallel, and synthesizes an answer with citations. Falls back to raw codebase exploration when wiki coverage is insufficient.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Effort**: medium
- **Command**: `/omcustom:wiki-rag`

## Relationships

- **Depends on**: [[wiki]], [[wiki-curator]]
- **Related**: [[intent-detection]]
- **See also**: [[r022]]

## Sources

- `.claude/skills/wiki-rag/SKILL.md` — skill definition
