---
title: lang-rust-expert
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/lang-rust-expert.md
related:
  - [[lang-golang-expert]]
  - [[lang-typescript-expert]]
  - [[lang-python-expert]]
  - [[lang-kotlin-expert]]
  - [[lang-java-expert]]
---

# lang-rust-expert

Expert Rust developer for writing safe, performant, idiomatic Rust code with mastery of ownership, borrowing, lifetimes, and fearless concurrency.

## Overview

`lang-rust-expert` handles all Rust language work — writing idiomatic code following the official Rust style guide, designing safe APIs that leverage Rust's type system for compile-time correctness, implementing zero-cost abstractions, correctly managing ownership/borrowing/lifetimes, writing efficient concurrent code with the fearless concurrency model, and optimizing for maximum performance without sacrificing safety.

Uses `rust-best-practices` skill and `guides/rust/` for reference documentation.

## Key Details

- **Model**: claude-sonnet-5
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `rust-best-practices`
- **Memory**: local (`.claude/agent-memory-local/lang-rust-expert/`, git-untracked)
- **Effort**: high
- **Permission Mode**: bypassPermissions

## Relationships

- **Depends on**: `rust-best-practices` skill, `guides/rust/`
- **Used by**: `dev-lead-routing` skill (Rust task routing)
- **See also**: [[lang-golang-expert]] (Go systems programming alternative), [[lang-typescript-expert]], [[lang-python-expert]], [[lang-kotlin-expert]], [[lang-java-expert]]

## Sources

- `.claude/agents/lang-rust-expert.md` — agent definition
