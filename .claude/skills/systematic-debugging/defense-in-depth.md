# Defense-in-Depth Validation

<!-- Source: https://github.com/tmdgusya/engineering-disciplines (MIT License) -->

## Overview

Instead of fixing bugs reactively, add validation at every layer so bugs become structurally impossible. Each layer catches what the previous layer missed.

**Core principle:** Don't just fix the bug. Add a guard that makes the bug impossible at every layer that should have caught it.

## When to Use

**Use when:**
- The same class of bug keeps appearing in different places
- A bug got through multiple layers that should have caught it
- You want to prevent regression of a hard-to-reproduce bug
- Building new features where invalid state could cause harm

## The Four Layers

### Layer 1: Input Validation (Entry Points)

Validate at the boundary where data enters your system.

```typescript
// ❌ No validation - bug can enter the system
async function createSession(projectDir: string): Promise<Session> {
  return new Session(projectDir);
}

// ✓ Validate at entry - bug is caught immediately
async function createSession(projectDir: string): Promise<Session> {
  if (!projectDir || projectDir.trim() === '') {
    throw new Error(`createSession: projectDir must be a non-empty string, got: ${JSON.stringify(projectDir)}`);
  }
  return new Session(projectDir);
}
```

**What to validate at entry points:**
- Non-empty strings for required path/name fields
- Valid ranges for numeric values
- Required fields exist in objects
- File/directory exists when required

### Layer 2: Constructor Guards (Object Creation)

Validate in constructors so objects can never be created in invalid state.

```typescript
// ❌ Object can be created with invalid state
class Session {
  constructor(private projectDir: string) {}
}

// ✓ Constructor prevents invalid state
class Session {
  constructor(private projectDir: string) {
    if (!projectDir || projectDir.trim() === '') {
      throw new Error(
        `Session: projectDir must be non-empty, got: ${JSON.stringify(projectDir)}`
      );
    }
  }
}
```

**Constructor guard pattern:**
```typescript
class WorktreeManager {
  constructor(private baseDir: string, private sessionId: string) {
    if (!baseDir) throw new Error('WorktreeManager: baseDir is required');
    if (!sessionId) throw new Error('WorktreeManager: sessionId is required');
  }
}
```

### Layer 3: Method Preconditions (Critical Operations)

Add guards before operations that could cause harm if called with bad state.

```typescript
// ❌ No precondition - git init could run in wrong directory
async function initializeWorktree(): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: this.projectDir });
}

// ✓ Precondition - verify state is valid before dangerous operation
async function initializeWorktree(): Promise<void> {
  if (!this.projectDir) {
    throw new Error(
      `initializeWorktree: projectDir is not set. ` +
      `This likely means the object was created with an empty path.`
    );
  }
  await execFileAsync('git', ['init'], { cwd: this.projectDir });
}
```

**When to add method preconditions:**
- Before file system operations (read, write, delete)
- Before network calls with user-provided data
- Before database writes
- Before spawning processes with user-provided arguments

### Layer 4: Test Assertions (Regression Prevention)

Add assertions in tests that would catch the bug early and clearly.

```typescript
// ❌ Test doesn't verify the path is correct
it('should initialize session', async () => {
  const session = await createSession(tempDir);
  expect(session).toBeDefined();
});

// ✓ Test verifies the critical invariant
it('should initialize session with correct project directory', async () => {
  const session = await createSession(tempDir);
  expect(session).toBeDefined();
  // Assert the invariant that was violated
  expect(session.projectDir).toBe(tempDir);
  expect(session.projectDir).not.toBe('');
  expect(session.projectDir).not.toBe(process.cwd());
});
```

**Test assertion patterns:**
```typescript
// Assert paths are absolute and within expected location
expect(path.isAbsolute(result.dir)).toBe(true);
expect(result.dir.startsWith(tempDir)).toBe(true);

// Assert values match what was provided (not defaults or fallbacks)
expect(result.name).toBe(providedName);
expect(result.id).not.toBe('');
```

## Applying Defense-in-Depth

When you find a bug, don't just fix it. Add guards at ALL four layers:

### Step 1: Fix the immediate bug

```typescript
// Fix the actual bug first
const context = setupCoreTest();
await context.initialize(); // Add the missing initialization
```

### Step 2: Add input validation

```typescript
export function createProject(name: string, dir: string): Project {
  if (!dir || dir.trim() === '') {
    throw new Error(`createProject: dir must be non-empty`);
  }
  return new Project(name, dir);
}
```

### Step 3: Add constructor guard

```typescript
class Project {
  constructor(name: string, dir: string) {
    if (!dir) throw new Error('Project: dir is required');
    this.dir = dir;
  }
}
```

### Step 4: Add method precondition

```typescript
async clone(): Promise<Project> {
  if (!this.dir) {
    throw new Error('Project.clone: dir must be set before cloning');
  }
  // ... clone logic
}
```

### Step 5: Add regression test

```typescript
it('should not use empty string as project dir', async () => {
  const project = await createProject('test', tempDir);
  expect(project.dir).toBe(tempDir);
  expect(project.dir).not.toBe('');
});
```

## Error Message Quality

Good error messages reduce debugging time from hours to minutes.

```typescript
// ❌ Unhelpful error
throw new Error('Invalid directory');

// ✓ Helpful error - includes what, where, why, and the actual value
throw new Error(
  `WorktreeManager.createWorktree: projectDir must be an absolute path to an existing directory.\n` +
  `Got: ${JSON.stringify(projectDir)}\n` +
  `Hint: Check that the project was initialized before calling this method.`
);
```

**Error message template:**
```
{ClassName}.{methodName}: {what went wrong}.
Got: {actual value}
Expected: {what was expected}
Hint: {likely cause or fix}
```

## Common Validation Patterns

```typescript
// Non-empty string
if (!value || typeof value !== 'string' || value.trim() === '') {
  throw new Error(`${context}: ${fieldName} must be a non-empty string, got: ${JSON.stringify(value)}`);
}

// Positive number
if (typeof value !== 'number' || value <= 0 || !isFinite(value)) {
  throw new Error(`${context}: ${fieldName} must be a positive number, got: ${value}`);
}

// Valid enum value
const validValues = ['draft', 'active', 'archived'] as const;
if (!validValues.includes(value)) {
  throw new Error(`${context}: ${fieldName} must be one of [${validValues.join(', ')}], got: ${JSON.stringify(value)}`);
}

// Required object field
if (!obj || typeof obj !== 'object') {
  throw new Error(`${context}: ${fieldName} must be an object, got: ${typeof obj}`);
}
```

## Result

After applying defense-in-depth to the session initialization bug:

- Layer 1 caught: Invalid input at `createSession()` entry point
- Layer 2 caught: Empty string in `Session` constructor
- Layer 3 caught: Unset `projectDir` before `git init`
- Layer 4 caught: Test assertion verified correct path was used

The bug class is now structurally impossible — it would be caught at the earliest possible point with a clear error message pointing to the root cause.
