# Rust Edition, MSRV, Workspaces and Async

> Reference for editions, `rust-version`, Cargo workspaces and async basics.
> Companion to the `rust-best-practices` skill, sections 10-12.

## Edition

Rust 2024 is released with version 1.85.0 (https://doc.rust-lang.org/edition-guide/rust-2024/index.html).
Set it in `Cargo.toml`:

```toml
[package]
edition = "2024"
```

### Migrating an existing crate

The edition guide lists these steps
(https://doc.rust-lang.org/edition-guide/editions/transitioning-an-existing-project-to-a-new-edition.html):

1. Run `cargo update` to update your dependencies to the latest versions.
2. Run `cargo fix --edition`.
3. Edit `Cargo.toml` and set the `edition` field to the next edition.
4. Run `cargo build` or `cargo test` to verify the fixes worked.
5. Run `cargo fmt` to reformat your project.

`cargo fix` cannot always fix the code automatically; it prints a warning for what it cannot fix.

## rust-version (MSRV)

`rust-version` tells Cargo which Rust version the package supports
(https://doc.rust-lang.org/cargo/reference/rust-version.html).

- On an unsupported toolchain Cargo reports an error instead of a less direct diagnostic such as invalid syntax.
- `--ignore-rust-version` opts in to an unsupported build.
- `cargo add` selects the latest dependency version compatible with your `rust-version`.
- Changing `rust-version` is assumed to be a minor incompatibility.
- `cargo-msrv` (third party) can find the minimum version compatible with your project as is.

## Workspaces

Source: https://doc.rust-lang.org/cargo/reference/workspaces.html

- A workspace root can be a *virtual manifest*: a `Cargo.toml` with `[workspace]` and no `[package]`.
- A virtual workspace has no `package.edition` to infer the resolver from, so set `resolver` explicitly.
- `resolver = "3"` is the default for edition 2024 and needs Rust 1.84+; it changes the default of
  `resolver.incompatible-rust-versions` from `allow` to `fallback`
  (https://doc.rust-lang.org/cargo/reference/resolver.html).
- Keys in `[workspace.package]` can be inherited by members (for example `edition.workspace = true`).

Root manifest (virtual workspace):

```toml
[workspace]
members = ["crates/app-core", "crates/app-cli"]
resolver = "3"

[workspace.package]
edition = "2024"
rust-version = "1.85"
```

Member manifest `crates/app-cli/Cargo.toml` (a separate file):

```toml
[package]
name = "app-cli"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
```

## Async

A `Future` is a value that might not have finished computing yet; its `poll` method tries to resolve it
and does not block when the value is not ready. Std docs: "Futures alone are inert; they must be actively
polled for the underlying computation to make progress"
(https://doc.rust-lang.org/std/future/trait.Future.html), so an async runtime has to poll them. The
`rust-best-practices` skill (section 11) uses Tokio and lists its rules (no blocking calls in async code,
no `std::sync::MutexGuard` across `.await`, `spawn_blocking`, `timeout`, `select!` cancellation safety).
Those Tokio specifics are not re-derived from the sources of this guide.
