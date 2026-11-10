---
name: rust-best-practices
description: Idiomatic Rust patterns from official guidelines
scope: core
user-invocable: false
---

## Purpose

Apply idiomatic Rust patterns and best practices from official documentation.

## Core Principles

```
Safety without garbage collection
Zero-cost abstractions
Fearless concurrency
Ownership as a feature
```

## Rules

### 1. Naming Conventions

```yaml
crates:
  style: snake_case or kebab-case
  example: my_crate, my-crate

modules:
  style: snake_case
  example: my_module

types:
  style: UpperCamelCase
  example: MyStruct, MyEnum

traits:
  style: UpperCamelCase
  example: Iterator, Display

functions_methods:
  style: snake_case
  example: my_function, get_value

constants:
  style: SCREAMING_SNAKE_CASE
  example: MAX_SIZE

type_parameters:
  style: single uppercase or CamelCase
  example: T, E, Item

lifetimes:
  style: short lowercase
  example: 'a, 'b, 'static

macros:
  style: snake_case!
  example: vec!, println!
```

### 2. Ownership and Borrowing

```yaml
principles:
  - Each value has exactly one owner
  - References cannot outlive the data they reference
  - Either one mutable reference OR many immutable references

prefer:
  - "&T over T" when not needing ownership
  - "&mut T over T" when modifying without consuming
  - "T over Box<T>" when size is known at compile time

avoid:
  - Clone when borrowing suffices
  - RefCell unless interior mutability is needed
  - Unsafe unless absolutely necessary
```

### 3. Error Handling

```yaml
result_type:
  - Return Result<T, E> for recoverable errors
  - Use ? operator for propagation
  - Define custom error types for libraries

option_type:
  - Use Option<T> for nullable values
  - Prefer map/and_then over match when appropriate
  - Use unwrap_or, unwrap_or_else, unwrap_or_default

panic:
  - Only for unrecoverable errors
  - Use in tests with assert!, assert_eq!
  - Avoid in library code

patterns: |
  // Propagation with ?
  fn read_file() -> Result<String, io::Error> {
      let mut file = File::open("file.txt")?;
      let mut contents = String::new();
      file.read_to_string(&mut contents)?;
      Ok(contents)
  }

  // Custom error type: Debug + Display + Error (+ From for `?`)
  #[derive(Debug)]
  enum MyError {
      Io(io::Error),
      Parse(ParseIntError),
  }

  impl fmt::Display for MyError {
      fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
          match self {
              MyError::Io(_) => write!(f, "IO error"),
              MyError::Parse(_) => write!(f, "Parse error"),
          }
      }
  }

  impl std::error::Error for MyError {
      fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
          match self {
              MyError::Io(e) => Some(e),
              MyError::Parse(e) => Some(e),
          }
      }
  }

  impl From<io::Error> for MyError {
      fn from(e: io::Error) -> Self { MyError::Io(e) }
  }

  impl From<ParseIntError> for MyError {
      fn from(e: ParseIntError) -> Self { MyError::Parse(e) }
  }

  // Alternative to the manual impls above (use one, not both): thiserror derives Display, Error and From
  // The wrapped error is exposed via source(), so the message does not repeat it
  #[derive(thiserror::Error, Debug)]
  enum MyError {
      #[error("IO error")]
      Io(#[from] io::Error),
      #[error("Parse error")]
      Parse(#[from] ParseIntError),
  }

crate_choice:
  - thiserror for libraries (typed, matchable error enums)
  - anyhow for applications (anyhow::Result and .context("...") for call-site context)
  - Do not expose anyhow::Error in a library's public API
```

### 4. Traits and Generics

```yaml
trait_design:
  - Keep traits focused and small
  - Use associated types for output types
  - Implement standard traits: Debug, Clone, Default, PartialEq

standard_traits:
  - Debug: for debugging output
  - Clone: explicit duplication
  - Default: default value construction
  - PartialEq, Eq: equality comparison
  - PartialOrd, Ord: ordering
  - Hash: for HashMap keys
  - Display: user-facing output
  - From/Into: type conversion

generics:
  - Use trait bounds to specify requirements
  - Prefer impl Trait in argument position
  - Use where clauses for complex bounds
```

### 5. Memory Management

```yaml
stack_vs_heap:
  - Stack: fixed-size, Copy types
  - Heap: dynamic-size, Box, Vec, String

smart_pointers:
  - Box<T>: heap allocation with single owner
  - Rc<T>: reference counting (single-threaded)
  - Arc<T>: atomic reference counting (multi-threaded)
  - RefCell<T>: interior mutability

avoid_leaks:
  - Drop trait for cleanup
  - RAII pattern for resources
  - Weak references to break cycles
```

### 6. Concurrency

```yaml
send_sync:
  - Send: safe to transfer between threads
  - Sync: safe to share references between threads

primitives:
  - Mutex<T>: mutual exclusion
  - RwLock<T>: multiple readers or one writer
  - Arc<T>: thread-safe reference counting
  - mpsc: channels for message passing

patterns: |
  // Shared state with Arc and Mutex
  let counter = Arc::new(Mutex::new(0));
  let counter_clone = Arc::clone(&counter);

  thread::spawn(move || {
      let mut num = counter_clone.lock().unwrap();
      *num += 1;
  });

  // Message passing
  let (tx, rx) = mpsc::channel();
  thread::spawn(move || {
      tx.send(value).unwrap();
  });
  let received = rx.recv().unwrap();
```

### 7. API Design

```yaml
guidelines:
  - Accept borrowed data when possible
  - Return owned data when the caller needs it
  - Use Into/AsRef for flexible parameters
  - Implement standard conversion traits

constructors:
  - new() for primary constructor
  - with_* for alternative constructors
  - Builder pattern for many parameters

methods:
  - is_* for boolean queries
  - as_* for cheap conversions (borrows)
  - to_* for expensive conversions (copies)
  - into_* for ownership transfers
```

### 8. Documentation

```yaml
rules:
  - Document all public items
  - Include examples in doc comments
  - Use # Examples section
  - Document panics, errors, safety

format: |
  /// Brief description.
  ///
  /// More detailed explanation if needed.
  ///
  /// # Examples
  ///
  /// ```
  /// let result = my_function(42);
  /// assert_eq!(result, 84);
  /// ```
  ///
  /// # Panics
  ///
  /// Panics if the input is zero.
  pub fn my_function(x: i32) -> i32 {
      x * 2
  }
```

### 9. Project Structure

```yaml
layout:
  - src/lib.rs or src/main.rs: crate root
  - src/bin/: additional binaries
  - tests/: integration tests
  - benches/: benchmarks
  - examples/: example programs

modules:
  - One module per file
  - mod.rs or filename.rs for module
  - pub use for re-exports
```

### 10. Edition and MSRV

```yaml
baseline: |
  As of 2026-11: latest stable Rust is 1.99.1 (2026-10-15), https://blog.rust-lang.org/releases/
  The Rust 2024 edition was stabilized in 1.85.0 (2025-02-20),
  https://doc.rust-lang.org/edition-guide/rust-2024/index.html
  Re-measure both against those pages before relying on them.

cargo_toml:
  - New crates target the 2024 edition: edition = "2024"
  - Set rust-version (MSRV) explicitly; edition 2024 needs a toolchain of 1.85.0 or newer
  - Raise rust-version deliberately and record it (changelog); do not let it drift
  - "Migrate an existing crate in the edition guide's order (https://doc.rust-lang.org/edition-guide/editions/transitioning-an-existing-project-to-a-new-edition.html): cargo update, cargo fix --edition, set the edition field in Cargo.toml, cargo build or cargo test, cargo fmt"
  - In a workspace, set edition and rust-version once in [workspace.package]
```

```toml
[package]
name = "my-crate"
version = "0.1.0"
edition = "2024"
rust-version = "1.85"
```

### 11. Async (Tokio)

```yaml
basics:
  - async fn returns a Future; it does nothing until awaited or spawned
  - Use Tokio as the runtime; enable only the features you need (rt, rt-multi-thread, macros, time, sync)
  - Libraries stay runtime-agnostic where possible; the application picks the runtime
  - Use #[tokio::main] on main and #[tokio::test] for async tests

avoid:
  - Blocking calls inside async code (std::thread::sleep, blocking file/network IO, heavy CPU)
  - Holding a std::sync::MutexGuard across an .await
  - Detached tasks whose errors are never observed

prefer:
  - tokio::time::sleep over std::thread::sleep
  - tokio::task::spawn_blocking for bounded blocking work that eventually finishes
  - For many or heavy CPU-bound jobs, bound concurrency (e.g. tokio::sync::Semaphore) or use a CPU-bound executor such as rayon
  - tokio::join! for concurrent futures, tokio::select! for racing them
  - tokio::sync::mpsc / oneshot for message passing between tasks
  - tokio::sync::Mutex only when the lock must be held across an .await; otherwise std Mutex
  - tokio::time::timeout around external calls
  - Keep the JoinHandle and handle its Result

spawn_bounds:
  - tokio::spawn requires the future and its output to be Send + 'static
  - Move owned data (Arc::clone) into the task instead of borrowing from the caller

select_cancellation:
  - In a select! loop, or when a dropped future's partial progress matters, use cancellation-safe futures (the losing branches are dropped)
```

```toml
[dependencies]
tokio = { version = "<tokio-version>", features = ["rt-multi-thread", "macros", "time"] }
```

```rust
use std::time::Duration;
use tokio::time::{sleep, timeout};

async fn fetch(id: u32) -> Result<String, std::io::Error> {
    sleep(Duration::from_millis(10)).await;
    Ok(format!("item-{id}"))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Run two futures concurrently
    let (a, b) = tokio::join!(fetch(1), fetch(2));
    println!("{} {}", a?, b?);

    // Spawn a task and observe its result
    let handle = tokio::spawn(async { fetch(3).await });
    println!("{}", handle.await??);

    // Bound an external call with a timeout
    let v = timeout(Duration::from_secs(1), fetch(4)).await??;
    println!("{v}");
    Ok(())
}
```

### 12. Tooling and Workspaces

```yaml
rustfmt:
  - cargo fmt --all formats the whole workspace
  - cargo fmt --all --check in CI (non-zero exit when formatting differs)
  - Keep a rustfmt.toml only for deliberate deviations from the default style

clippy:
  - cargo clippy --all-targets --all-features -- -D warnings in CI
  - Fix the lint before adding #[allow(...)]; scope any allow narrowly and add a reason

cargo_checks:
  - cargo check for fast feedback, cargo test for unit, integration and doc tests
  - cargo doc --no-deps to build the docs

workspace:
  - Use a Cargo workspace for multiple related crates sharing one Cargo.lock and target directory
  - Root Cargo.toml has [workspace] with members; a virtual root has no [package]
  - Share metadata with [workspace.package] and dependency versions with [workspace.dependencies]
  - Members inherit with edition.workspace = true and dep.workspace = true
  - Run cargo commands per workspace with --workspace, or per crate with -p <name>
```

Root `Cargo.toml` (virtual workspace, no `[package]`):

```toml
[workspace]
members = ["crates/app-core", "crates/app-cli"]
resolver = "3"

[workspace.package]
edition = "2024"
rust-version = "1.85"
```

Member `crates/app-cli/Cargo.toml` (a separate file; do not paste it into the root):

```toml
[package]
name = "app-cli"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true

[dependencies]
app-core = { path = "../app-core" }
```

## Application

When writing or reviewing Rust code:

1. **Always** handle ownership correctly
2. **Always** handle errors with Result/Option
3. **Prefer** borrowing over cloning
4. **Prefer** zero-cost abstractions
5. **Implement** standard traits (Debug, Clone, etc.)
6. **Document** public APIs with examples
7. **Avoid** unsafe unless necessary
8. **Use** rustfmt and clippy (Section 12)
9. **Set** `edition` and `rust-version` in Cargo.toml (Section 10)
10. **Keep** blocking work out of async code (Section 11)
