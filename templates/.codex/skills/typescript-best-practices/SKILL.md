---
name: typescript-best-practices
description: Type-safe TypeScript patterns from industry standards
user-invocable: false
---

## Purpose

Apply type-safe TypeScript patterns and best practices from industry standards.

## Core Principles

```
Type safety over convenience
Explicit over implicit
Prefer strict mode
Use inference wisely
```

## Rules

### 1. Type System

```yaml
type_inference:
  rely_on: trivially inferred types (primitives, literals)
  annotate: complex expressions, return types, public APIs

any_vs_unknown:
  prefer: unknown (requires type narrowing)
  avoid: any (disables type checking)
  if_any_needed: add suppressing comment

nullable:
  prefer: "field?: Type"
  avoid: "field: Type | undefined"
  compare_enums: explicitly, not boolean coercion

patterns: |
  // Good: unknown with narrowing
  function process(data: unknown): void {
    if (typeof data === 'string') {
      console.log(data.toUpperCase());
    }
  }

  // Avoid: any
  function process(data: any): void {
    console.log(data.toUpperCase()); // No type checking!
  }
```

### 2. Interfaces vs Types

```yaml
prefer_interfaces:
  - Object type definitions
  - Public API contracts
  - Extendable types

use_types_for:
  - Union types
  - Intersection types
  - Mapped types
  - Utility types

patterns: |
  // Interface for objects
  interface User {
    id: string;
    name: string;
    email: string;
  }

  // Type for unions/utilities
  type Status = 'pending' | 'active' | 'completed';
  type ReadonlyUser = Readonly<User>;
```

### 3. Arrays and Generics

```yaml
array_syntax:
  simple_types: "T[]"
  complex_types: "Array<T>"

generics:
  naming: single uppercase (T, K, V) or descriptive (TItem, TResult)
  constraints: use extends for type bounds
  defaults: provide when appropriate

patterns: |
  // Array syntax
  const numbers: number[] = [1, 2, 3];
  const items: Array<{ id: string; value: number }> = [];

  // Generic constraints
  function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
    return obj[key];
  }
```

### 4. Variables and Constants

```yaml
declarations:
  prefer: const
  when_needed: let
  never: var

one_per_statement: true

patterns: |
  // Good
  const name = 'TypeScript';
  const version = 5.0;

  // Avoid
  var name = 'TypeScript', version = 5.0;
```

### 5. Functions

```yaml
function_declarations:
  named_functions: function declaration
  callbacks: arrow functions
  methods: shorthand syntax

parameters:
  prefer_rest: "...args: T[]"
  avoid: arguments object

this_handling:
  prefer: arrow functions or explicit parameter
  avoid: rebinding with bind/call/apply

patterns: |
  // Function declaration
  function processData(data: Data): Result {
    return transform(data);
  }

  // Arrow function for callbacks
  items.map((item) => item.value);

  // Rest parameters
  function concat(...strings: string[]): string {
    return strings.join('');
  }
```

### 6. Classes

```yaml
visibility:
  prefer: explicit modifiers (public, private, protected)
  avoid: private fields (#)

initialization:
  prefer: at declaration site
  use: parameter properties in constructors

readonly:
  apply_to: non-reassigned properties

patterns: |
  class User {
    readonly id: string;
    private email: string;

    constructor(
      public name: string,
      email: string,
    ) {
      this.id = generateId();
      this.email = email;
    }
  }
```

### 7. Naming Conventions

```yaml
UpperCamelCase:
  - Classes
  - Interfaces
  - Type aliases
  - Enums
  - Type parameters

lowerCamelCase:
  - Variables
  - Parameters
  - Functions
  - Methods
  - Properties

CONSTANT_CASE:
  - Global constants
  - Enum values
  - Static readonly fields

rules:
  - No leading/trailing underscores
  - No abbreviations (except universal: URL, ID, DNS)
  - Acronyms as whole words: loadHttpUrl, not loadHTTPURL
  - Single-letter names only in 10-line scopes
```

### 8. Control Flow

```yaml
braces:
  always: use braces for all control statements

equality:
  always: "=== and !=="
  never: "== and !="

loops:
  arrays: for...of
  objects: for...in with hasOwnProperty check

patterns: |
  // Always braced
  if (condition) {
    doSomething();
  }

  // for...of for arrays
  for (const item of items) {
    process(item);
  }

  // for...in with check
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      process(obj[key]);
    }
  }
```

### 9. Error Handling

```yaml
throwing:
  only: Error instances
  with_message: descriptive error messages

catching:
  type: unknown
  validate: before use

empty_catch:
  require: rationale comment

patterns: |
  // Throw Error instances
  throw new Error('Invalid input');

  // Catch with unknown
  try {
    riskyOperation();
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error.message);
    }
    throw error;
  }
```

### 10. Imports and Exports

```yaml
imports:
  prefer: named imports
  use_namespace: for large APIs
  prefer_relative: within project

exports:
  prefer: named exports
  avoid: default exports

patterns: |
  // Named imports
  import { User, UserService } from './user';

  // Namespace import for large APIs
  import * as fs from 'fs';

  // Named exports
  export interface User { }
  export function createUser() { }
```

### 11. Disallowed Features

```yaml
never_use:
  - eval() or dynamic code evaluation
  - with statements
  - const enum (use plain enum)
  - debugger statements in production
  - Modifying built-in prototypes
  - Wrapper objects (new String(), new Boolean())
  - Automatic semicolon insertion reliance
```

## Application

When writing or reviewing TypeScript code:

1. **Always** enable strict mode
2. **Always** use explicit return types for public APIs
3. **Prefer** unknown over any
4. **Prefer** interfaces for object types
5. **Use** const by default
6. **Use** triple equals exclusively
7. **Handle** errors with typed catch blocks
8. **Avoid** default exports
