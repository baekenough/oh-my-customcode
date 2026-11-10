---
title: Rust Best Practices
type: skill
updated: 2026-11-10
sources:
  - .claude/skills/rust-best-practices/SKILL.md
related:
  - [[lang-rust-expert]]
---

# Rust Best Practices

Idiomatic Rust patterns from official Rust documentation, with an explicit edition/MSRV baseline.

## Overview

The skill holds 12 rule sections for [[lang-rust-expert]]: naming conventions, ownership and borrowing, error handling, traits and generics, memory management, concurrency, API design, documentation, project structure, edition and MSRV, async (Tokio), and tooling and workspaces. Coverage is deliberately bounded: lifetimes appear only as the short-lowercase naming convention (`'a`), unsafe code only as the guidance to avoid unsafe unless necessary, and iterator adapters are not covered.

## Key Rules by Section

- **Error handling**: `Result<T, E>` with the `?` operator. The custom error example implements `Display` without repeating the wrapped error's message and exposes the wrapped error through `source()`. `thiserror` is shown as an alternative to the manual impls (use one, not both): `thiserror` for libraries, `anyhow` (with `.context(...)`) for applications, and no `anyhow::Error` in a library's public API.
- **Edition and MSRV**: new crates target `edition = "2024"` and set `rust-version` explicitly; edition 2024 needs a toolchain of 1.85.0 or newer. The skill's version figures are marked "As of 2026-11" with source URLs and must be re-measured before use. Migrating an existing crate follows the edition guide's order: `cargo update`, `cargo fix --edition`, set the `edition` field in `Cargo.toml`, `cargo build` or `cargo test`, then `cargo fmt`; in a workspace, `edition` and `rust-version` are set once in `[workspace.package]`.
- **Async (Tokio)**: Tokio as the runtime with only needed features enabled. Avoid blocking calls inside async code and holding a `std::sync::MutexGuard` across an `.await`. Prefer `tokio::join!`, `select!`, `timeout`, and `spawn_blocking` for bounded blocking work. `tokio::spawn` requires `Send + 'static` futures.
- **Tooling and workspaces**: `cargo fmt --all --check` and `cargo clippy --all-targets --all-features -- -D warnings` in CI. A Cargo workspace shares one `Cargo.lock`, with metadata in `[workspace.package]` and dependency versions in `[workspace.dependencies]`. The workspace example shows the root `Cargo.toml` (virtual workspace, no `[package]`) and a member `crates/app-cli/Cargo.toml` as separate files.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[lang-rust-expert]]
- **Related skills**: []
- **See also**: guides/rust/

## Sources

- `.claude/skills/rust-best-practices/SKILL.md` — skill definition
