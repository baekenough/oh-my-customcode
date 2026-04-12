---
title: fe-flutter-agent
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/fe-flutter-agent.md
related:
  - [[lang-kotlin-expert]]
  - [[fe-vercel-agent]]
---

# fe-flutter-agent

Expert Flutter/Dart cross-platform app developer covering widget composition, state management (Riverpod/BLoC), navigation, and performance optimization for iOS, Android, and web.

## Overview

`fe-flutter-agent` builds production Flutter applications using the modern Dart 3.x feature set. Its default stack is Riverpod 3.0 for state management, go_router for declarative navigation with deep linking, freezed + json_serializable for immutable data models, and dio for HTTP. It handles performance patterns (const constructors, RepaintBoundary, Isolates), platform channel integration for native iOS/Android, and security hardening (flutter_secure_storage, obfuscation, certificate pinning).

## Key Details

- **Model**: sonnet
- **Domain**: frontend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `flutter-best-practices`
- **Memory**: project
- **Effort**: medium

## Default Stack

| Concern | Package |
|---------|---------|
| State | Riverpod 3.0 |
| Navigation | go_router |
| Models | freezed + json_serializable |
| HTTP | dio |
| Testing | flutter_test + mocktail |

## Relationships

- **Depends on**: `flutter-best-practices` skill
- **Used by**: `dev-lead-routing` skill (Flutter/mobile task routing)
- **See also**: [[lang-kotlin-expert]] (Android native), [[fe-vercel-agent]] (web frontend alternative)

## Sources

- `.claude/agents/fe-flutter-agent.md` — agent definition
