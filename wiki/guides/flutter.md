---
title: "Flutter Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/flutter/architecture.md
related:
  - [[fe-flutter-agent]]
  - [[flutter-best-practices]]
---

# Flutter Guide

Reference documentation for Flutter application architecture, state management, and Dart best practices.

## Overview

Covers the official Flutter MVVM architecture pattern with View (Widget), ViewModel (ChangeNotifier/Notifier), Repository, and Service layers. Includes project structure recommendations for small, medium, and large apps, dependency injection with `provider`/`riverpod`, and the Command pattern for ViewModel actions. Used by `fe-flutter-agent` for mobile/cross-platform development.

## Key Topics

- Official MVVM architecture: View → ViewModel → Repository → Service
- Dependency direction rules (always inward, no reverse dependencies)
- Command pattern for ViewModels (`Command0`, `Command1`)
- Project structure for medium apps (ui/core, ui/feature, data layers)
- State management patterns: ChangeNotifier, Notifier, Riverpod
- Widget composition and performance optimization
- Navigation and routing patterns

## Relationships

- **Used by agents**: [[fe-flutter-agent]]
- **Related skills**: [[flutter-best-practices]]
- **See also**: [[typescript]], [[web-design]]

## Sources

- `guides/flutter/architecture.md` — MVVM pattern, dependency rules, ViewModel with Commands
