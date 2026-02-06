---
name: rust-best-practices
description: Idiomatic Rust patterns from official guidelines
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

  // Custom error type
  #[derive(Debug)]
  enum MyError {
      Io(io::Error),
      Parse(ParseIntError),
  }
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

## Application

When writing or reviewing Rust code:

1. **Always** handle ownership correctly
2. **Always** handle errors with Result/Option
3. **Prefer** borrowing over cloning
4. **Prefer** zero-cost abstractions
5. **Implement** standard traits (Debug, Clone, etc.)
6. **Document** public APIs with examples
7. **Avoid** unsafe unless necessary
8. **Use** clippy for linting
