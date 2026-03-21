# Condition-Based Waiting

<!-- Source: https://github.com/tmdgusya/engineering-disciplines (MIT License) -->

## Overview

Arbitrary delays (`sleep`, `setTimeout`, `await new Promise(r => setTimeout(r, 1000))`) are a debugging anti-pattern. They hide timing issues, make tests slow, and still fail intermittently.

**Core principle:** Replace arbitrary delays with condition-based polling that waits for the actual state you need.

## When to Use

**Use when:**
- Tests use `await sleep(1000)` or similar arbitrary waits
- Code has `setTimeout` for "giving time" to async operations
- Tests are flaky because timing depends on system speed
- You need to wait for: file to exist, process to start, server to be ready, database record to appear

## The Problem with Arbitrary Delays

```typescript
// ❌ Arbitrary delay - fragile and slow
await fs.writeFile(path, content);
await sleep(500); // "Give it time to write"
const result = await fs.readFile(path);

// Problems:
// 1. 500ms may not be enough on slow systems
// 2. 500ms is always wasted on fast systems
// 3. The actual condition (file readable) is never verified
```

## The Solution: Condition-Based Waiting

```typescript
// ✓ Condition-based - fast and reliable
await fs.writeFile(path, content);
await waitUntil(() => fs.access(path).then(() => true).catch(() => false));
const result = await fs.readFile(path);

// Benefits:
// 1. Proceeds as soon as condition is met (fast on fast systems)
// 2. Has a timeout for safety (catches real failures)
// 3. The actual condition is explicit and verified
```

## Core Implementation

```typescript
interface WaitOptions {
  timeout?: number;      // Max wait time in ms (default: 5000)
  interval?: number;     // Poll interval in ms (default: 100)
  message?: string;      // Error message on timeout
}

async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = 5000, interval = 100, message = 'Condition not met' } = options;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const result = await condition();
    if (result) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`waitUntil timeout after ${timeout}ms: ${message}`);
}
```

See `condition-based-waiting-example.ts` for the complete implementation with all utilities.

## Common Patterns

### Wait for File to Exist

```typescript
// ❌ Arbitrary delay
await triggerFileCreation();
await sleep(1000);
const content = await fs.readFile(outputPath, 'utf-8');

// ✓ Condition-based
await triggerFileCreation();
await waitUntil(
  () => fs.access(outputPath).then(() => true).catch(() => false),
  { timeout: 5000, message: `File not created: ${outputPath}` }
);
const content = await fs.readFile(outputPath, 'utf-8');
```

### Wait for Process to Start

```typescript
// ❌ Arbitrary delay
startServer();
await sleep(2000); // "Give server time to start"
const response = await fetch('http://localhost:3000/health');

// ✓ Condition-based
startServer();
await waitUntil(
  async () => {
    try {
      const res = await fetch('http://localhost:3000/health');
      return res.ok;
    } catch {
      return false;
    }
  },
  { timeout: 10000, message: 'Server did not start within 10s' }
);
const response = await fetch('http://localhost:3000/health');
```

### Wait for Database Record

```typescript
// ❌ Arbitrary delay
await triggerAsyncOperation();
await sleep(500);
const record = await db.find({ id: expectedId });

// ✓ Condition-based
await triggerAsyncOperation();
await waitUntil(
  async () => {
    const record = await db.find({ id: expectedId });
    return record !== null;
  },
  { timeout: 3000, message: `Record ${expectedId} not created` }
);
const record = await db.find({ id: expectedId });
```

### Wait for Log Output

```typescript
// ❌ Arbitrary delay
process.spawn('my-command');
await sleep(1000);
expect(logOutput).toContain('Server started');

// ✓ Condition-based
const logOutput: string[] = [];
const proc = process.spawn('my-command');
proc.stdout.on('data', (chunk) => logOutput.push(chunk.toString()));

await waitUntil(
  () => logOutput.some(line => line.includes('Server started')),
  { timeout: 10000, message: 'Server start message not seen in logs' }
);
```

### Wait for Count to Reach Expected Value

```typescript
// ❌ Arbitrary delay
await triggerBatchOperation();
await sleep(2000);
const items = await db.findAll();
expect(items.length).toBe(10);

// ✓ Condition-based
await triggerBatchOperation();
await waitUntil(
  async () => {
    const items = await db.findAll();
    return items.length >= 10;
  },
  { timeout: 5000, message: 'Batch did not complete: expected 10 items' }
);
const items = await db.findAll();
expect(items.length).toBe(10);
```

## Choosing Timeout and Interval Values

| Scenario | Timeout | Interval | Rationale |
|----------|---------|----------|-----------|
| File write | 2s | 50ms | Fast local I/O |
| Process start | 10s | 200ms | Process startup varies |
| HTTP server ready | 15s | 300ms | Server may need to compile |
| Database record | 3s | 100ms | DB writes are fast |
| CI environment | 2-3x local | same | CI is often slower |

**Rule of thumb:**
- Interval: 10-20% of expected wait time, minimum 50ms
- Timeout: 3-5x the typical wait time
- Add a buffer for CI: multiply timeout by 2-3x

## Testing the Waiters Themselves

```typescript
// Test that waitUntil resolves when condition becomes true
it('resolves when condition becomes true', async () => {
  let ready = false;
  setTimeout(() => { ready = true; }, 100);

  await expect(
    waitUntil(() => ready, { timeout: 1000 })
  ).resolves.toBeUndefined();
});

// Test that waitUntil rejects on timeout
it('rejects with timeout error when condition never met', async () => {
  await expect(
    waitUntil(() => false, { timeout: 100, message: 'test condition' })
  ).rejects.toThrow('waitUntil timeout after 100ms: test condition');
});
```

## Migration Guide

When refactoring existing `sleep` calls:

1. **Identify what the sleep is "waiting for"** — read surrounding code
2. **Find the observable state change** — what becomes true when the operation completes?
3. **Replace with `waitUntil(condition)`** — poll for that state
4. **Set appropriate timeout** — 3-5x the typical wait time
5. **Add descriptive message** — what should have happened?

```typescript
// Before
await startProcess();
await sleep(2000);
checkResult();

// After - step 1: what is sleep waiting for? Process to be ready.
// After - step 2: observable state? Process responds to health check.
// After - step 3-5:
await startProcess();
await waitUntil(
  () => isProcessReady(),
  { timeout: 10000, message: 'Process did not become ready' }
);
checkResult();
```
