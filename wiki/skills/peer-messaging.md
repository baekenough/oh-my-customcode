---
title: Peer Messaging
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/peer-messaging/SKILL.md
related:
  - [[R018]]
  - [[agora]]
  - [[research]]
---

# Peer Messaging

Cross-session Claude Code instance communication via claude-peers-mcp broker.

## Overview

Enables communication between separate Claude Code processes (cross-session) via a localhost claude-peers-mcp broker. Distinct from Agent Teams `SendMessage` (intra-session). Supports broadcast and targeted messaging between named Claude Code instances. Used in multi-terminal coordination scenarios where Agent Teams is insufficient. Requires claude-peers-mcp server configured.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[agora]], [[research]]
- **See also**: [[R018]]

## Sources

- `.claude/skills/peer-messaging/SKILL.md` — skill definition
