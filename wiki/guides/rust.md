---
title: "Rust Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/rust/error-handling.md
related:
  - [[lang-rust-expert]]
  - [[rust-best-practices]]
---

# Rust Guide

Reference documentation for idiomatic Rust patterns, error handling, ownership, and systems programming best practices.

## Overview

Covers Rust's ownership model, borrowing and lifetimes, error handling with `Result<T,E>` and the `?` operator, trait design, async/await with Tokio, and performance patterns. Based on the Rust Book, Rust Reference, and idiomatic Rust community patterns. Used by `lang-rust-expert` for systems programming and performance-critical tasks.

## Key Topics

- `Result<T, E>` and `Option<T>` error handling patterns
- The `?` operator and `From`/`Into` trait implementations
- Custom error types with `thiserror` and `anyhow`
- Ownership, borrowing, and lifetime annotations
- Trait objects vs generics trade-offs
- Async/await with Tokio runtime
- `cargo clippy` and idiomatic code patterns

## Relationships

- **Used by agents**: [[lang-rust-expert]]
- **Related skills**: [[rust-best-practices]]
- **See also**: [[golang]], [[typescript]]

## Sources

- `guides/rust/error-handling.md` — Result type, match patterns, ? operator, custom errors
