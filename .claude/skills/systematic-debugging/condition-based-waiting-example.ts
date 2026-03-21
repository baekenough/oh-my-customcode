// Source: https://github.com/tmdgusya/engineering-disciplines (MIT License)
// Complete implementation of condition-based waiting utilities

import { access, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// ============================================================
// Core waitUntil implementation
// ============================================================

export interface WaitOptions {
  /** Maximum wait time in milliseconds. Default: 5000 */
  timeout?: number;
  /** Polling interval in milliseconds. Default: 100 */
  interval?: number;
  /** Error message to show on timeout */
  message?: string;
}

/**
 * Waits until the condition returns true, polling at the specified interval.
 * Throws a timeout error if the condition is not met within the timeout period.
 *
 * @example
 * // Wait for a file to exist
 * await waitUntil(
 *   () => fileExists('/path/to/file'),
 *   { timeout: 5000, message: 'File was not created' }
 * );
 */
export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = 5000, interval = 100, message = 'Condition was not met' } = options;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const result = await condition();
    if (result) return;
    await sleep(interval);
  }

  throw new Error(`waitUntil timeout after ${timeout}ms: ${message}`);
}

/**
 * Waits until the condition returns a truthy value (not undefined/null/false),
 * then returns that value.
 *
 * @example
 * const record = await waitFor(
 *   () => db.find({ id: 'expected-id' }),
 *   { timeout: 3000, message: 'Record was not created' }
 * );
 */
export async function waitFor<T>(
  condition: () => T | Promise<T>,
  options: WaitOptions = {}
): Promise<T> {
  const { timeout = 5000, interval = 100, message = 'Value was not available' } = options;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const result = await condition();
    if (result) return result;
    await sleep(interval);
  }

  throw new Error(`waitFor timeout after ${timeout}ms: ${message}`);
}

// ============================================================
// Common condition helpers
// ============================================================

/**
 * Returns true if the file exists and is accessible.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true if the file exists and has content (size > 0).
 */
export async function fileHasContent(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.size > 0;
  } catch {
    return false;
  }
}

/**
 * Returns true if the file exists and contains the expected text.
 */
export async function fileContains(filePath: string, text: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content.includes(text);
  } catch {
    return false;
  }
}

/**
 * Returns true if the HTTP endpoint responds with a successful status code.
 */
export async function httpEndpointReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Returns true if all files in the list exist.
 */
export async function allFilesExist(filePaths: string[]): Promise<boolean> {
  const results = await Promise.all(filePaths.map(fileExists));
  return results.every(Boolean);
}

// ============================================================
// Convenience waiters
// ============================================================

/**
 * Waits for a file to exist.
 *
 * @example
 * await waitForFile('/path/to/output.json', { timeout: 5000 });
 */
export async function waitForFile(filePath: string, options: WaitOptions = {}): Promise<void> {
  await waitUntil(() => fileExists(filePath), {
    timeout: 5000,
    message: `File not created: ${filePath}`,
    ...options,
  });
}

/**
 * Waits for a file to contain specific text.
 *
 * @example
 * await waitForFileContent('/path/to/log.txt', 'Server started', { timeout: 10000 });
 */
export async function waitForFileContent(
  filePath: string,
  text: string,
  options: WaitOptions = {}
): Promise<void> {
  await waitUntil(() => fileContains(filePath, text), {
    timeout: 5000,
    message: `File ${filePath} did not contain: ${text}`,
    ...options,
  });
}

/**
 * Waits for an HTTP endpoint to respond with a successful status.
 *
 * @example
 * await waitForServer('http://localhost:3000/health', { timeout: 15000 });
 */
export async function waitForServer(url: string, options: WaitOptions = {}): Promise<void> {
  await waitUntil(() => httpEndpointReady(url), {
    timeout: 15000,
    interval: 300,
    message: `Server at ${url} did not become ready`,
    ...options,
  });
}

/**
 * Waits for a directory to contain at least minCount files.
 *
 * @example
 * await waitForDirectoryCount('/output/dir', 3, { timeout: 5000 });
 */
export async function waitForDirectoryCount(
  dirPath: string,
  minCount: number,
  options: WaitOptions = {}
): Promise<void> {
  const { readdir } = await import('node:fs/promises');
  await waitUntil(
    async () => {
      try {
        const entries = await readdir(dirPath);
        return entries.length >= minCount;
      } catch {
        return false;
      }
    },
    {
      timeout: 5000,
      message: `Directory ${dirPath} did not reach ${minCount} files`,
      ...options,
    }
  );
}

// ============================================================
// Utilities
// ============================================================

/**
 * Sleep for the specified number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Usage examples (not for import, documentation only)
// ============================================================

/*
// Example 1: Wait for build output file
await waitForFile(join(outputDir, 'bundle.js'), { timeout: 30000 });

// Example 2: Wait for server to start
await waitForServer('http://localhost:8080/health', { timeout: 20000 });

// Example 3: Wait for database record with custom condition
const user = await waitFor(
  async () => {
    const u = await db.users.findUnique({ where: { email: 'test@example.com' } });
    return u?.emailVerified ? u : null;
  },
  { timeout: 5000, message: 'User email was not verified' }
);

// Example 4: Wait for process output
const logs: string[] = [];
const proc = spawn('npm', ['start']);
proc.stdout.on('data', (chunk) => logs.push(chunk.toString()));

await waitUntil(
  () => logs.some((line) => line.includes('Listening on port')),
  { timeout: 15000, interval: 200, message: 'Server did not log startup message' }
);

// Example 5: Wait for all output files to be generated
const expectedFiles = ['report.json', 'summary.txt', 'data.csv'].map((f) =>
  join(outputDir, f)
);
await waitUntil(() => allFilesExist(expectedFiles), {
  timeout: 10000,
  message: `Not all output files were generated in ${outputDir}`,
});

// Example 6: Test that verifies count reaches expected value
it('should process all items', async () => {
  await triggerBatchProcessing(items);

  await waitUntil(
    async () => {
      const processed = await db.items.count({ where: { status: 'done' } });
      return processed >= items.length;
    },
    { timeout: 5000, message: `Expected ${items.length} items to be processed` }
  );

  const processed = await db.items.count({ where: { status: 'done' } });
  expect(processed).toBe(items.length);
});
*/
