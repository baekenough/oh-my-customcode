---
name: java21-best-practices
description: Modern Java 21 patterns from Virtual Threads, Pattern Matching, Records, and Sealed Classes
scope: core
user-invocable: false
---

## Purpose

Apply modern Java 21 patterns and best practices leveraging the latest language features for clean, performant, and maintainable Java code.

## Core Principles

```
Embrace modern Java features over legacy patterns
Prefer immutability and data-centric design
Leverage Virtual Threads for scalable concurrency
Use Pattern Matching for expressive type handling
```

## Rules

### 1. Naming Conventions (Google Java Style)

```yaml
packages:
  style: lowercase, no underscores
  example: com.example.project

classes:
  style: UpperCamelCase
  example: OrderProcessor, UserRecord

methods_variables:
  style: lowerCamelCase
  example: processOrder(), itemCount

constants:
  style: UPPER_SNAKE_CASE
  example: static final int MAX_RETRIES = 3

records:
  style: UpperCamelCase (same as class)
  example: record Point(int x, int y) {}
```

Reference: guides/java21/java-style-guide.md

### 2. Virtual Threads (JEP 444)

```yaml
principles:
  - Use Virtual Threads for I/O-bound tasks
  - Avoid pooling Virtual Threads (they are lightweight)
  - Replace thread pools for blocking I/O with Virtual Thread executors

patterns:
  executor: "Executors.newVirtualThreadPerTaskExecutor()"
  direct: "Thread.ofVirtual().start(() -> { ... })"
  structured: "StructuredTaskScope.ShutdownOnFailure() for fork/join"

antipatterns:
  - "Executors.newFixedThreadPool() for I/O tasks — use Virtual Threads instead"
  - "Thread.sleep() on platform threads for rate limiting — use Virtual Threads"
  - "synchronized blocks in Virtual Thread code — use ReentrantLock instead"
```

Reference: guides/java21/modern-java21.md

### 3. Pattern Matching

```yaml
instanceof_patterns:
  rule: "Use pattern variable binding instead of explicit casts"
  guard: "Combine with && for conditional matching"

switch_patterns:
  rule: "Pattern matching for switch (JEP 441) — use case Type var syntax"
  guards: "Use 'when' clause for conditional cases"
  null_handling: "case null supported in switch"
```

Reference: guides/java21/modern-java21.md

### 4. Records (JEP 395)

```yaml
principles:
  - Use Records for immutable data carriers
  - Prefer Records over POJOs with getters/setters for pure data
  - Compact constructors for validation

features:
  validation: "Compact constructor (no parens) for input validation"
  methods: "Custom methods allowed alongside auto-generated accessors"
  interfaces: "Records can implement interfaces"

antipatterns:
  - "Mutable state in records — records are inherently immutable"
  - "Using records for entities with behavior — prefer classes"
```

Reference: guides/java21/modern-java21.md

### 5. Record Patterns (JEP 440)

```yaml
patterns:
  instanceof: "Deconstruct record components in instanceof check"
  switch: "Deconstruct in switch case labels"
  nested: "Nested record patterns for deep destructuring"
```

Reference: guides/java21/modern-java21.md

### 6. Sealed Classes (JEP 409)

```yaml
principles:
  - Use Sealed Classes for closed type hierarchies
  - Combine with Pattern Matching switch for exhaustive handling
  - Prefer sealed interfaces for behavior-focused hierarchies

pattern: "sealed interface with record implementations, exhaustive switch (no default needed)"
```

Reference: guides/java21/modern-java21.md

### 7. Sequenced Collections (JEP 431)

```yaml
principles:
  - Use SequencedCollection for ordered access
  - getFirst()/getLast() replace get(0) and get(size-1)

methods: "getFirst(), getLast(), addFirst(), addLast(), reversed(), firstEntry()"
```

Reference: guides/java21/modern-java21.md

### 8. Text Blocks and String Features

```yaml
patterns:
  text_blocks: "Triple-quote \"\"\" for multi-line strings (since Java 15)"
  formatted: "String.formatted() for template substitution (since Java 15)"
```

Reference: guides/java21/modern-java21.md

### 9. Error Handling

```yaml
principles:
  - Prefer checked exceptions for recoverable conditions
  - Use unchecked exceptions for programming errors
  - Never swallow exceptions silently
  - Use specific exception types

patterns:
  optional: "orElseThrow(() -> new SpecificException(msg)) for missing values"
  multi_catch: "catch (IOException | SQLException e) for related exceptions"
```

Reference: guides/java21/java-style-guide.md

### 10. Documentation

```yaml
best_practices:
  - Use @param and @return for public API
  - Link related types with {@link}
  - Document checked exceptions with @throws
  - Keep Javadoc focused on "what", not "how"
```

Reference: guides/java21/java-style-guide.md

## Application

When writing or reviewing Java 21 code:

1. **Use** Records for pure data classes over verbose POJOs
2. **Use** Sealed Classes + Pattern Matching for type hierarchies
3. **Use** Virtual Threads for I/O-bound concurrency
4. **Use** `instanceof` pattern matching over explicit casts
5. **Prefer** switch expressions over switch statements
6. **Use** `getFirst()`/`getLast()` for sequenced collections
7. **Write** exhaustive switch for sealed types (no default)
8. **Document** public APIs with proper Javadoc
