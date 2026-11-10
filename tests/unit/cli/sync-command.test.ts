/**
 * Unit tests for the `check` flow of syncCommand() in src/cli/sync.ts.
 *
 * syncCheck() is stubbed with spyOn (restored after each test, no mock.module leakage) so the
 * CLI output contract can be pinned without depending on the package's template tree.
 * The command runs from an mkdtemp directory.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { realpathSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { syncCommand } from '../../../src/cli/sync.js';
import type { SyncCheckResult } from '../../../src/core/sync.js';
import * as syncCore from '../../../src/core/sync.js';
import { initI18n } from '../../../src/i18n/index.js';

class ExitSignal extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

function makeResult(overrides: Partial<SyncCheckResult> = {}): SyncCheckResult {
  return {
    inSync: true,
    added: [],
    removed: [],
    modified: [],
    unchanged: 0,
    referenceVersion: '2.0.19',
    currentVersion: '2.0.19',
    totalTracked: 0,
    ...overrides,
  };
}

beforeAll(async () => {
  // syncCommand() reads i18n.t(...) for the description; uninitialized it returns undefined
  await initI18n('en');
});

let tempDir: string;
let originalCwd: string;
let stdout: string[];
let stderr: string[];
let exitCodes: Array<number | undefined>;

let logSpy: ReturnType<typeof spyOn>;
let errorSpy: ReturnType<typeof spyOn>;
let exitSpy: ReturnType<typeof spyOn>;
let syncCheckSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  tempDir = realpathSync(await mkdtemp(join(tmpdir(), 'omcc-sync-cmd-test-')));
  originalCwd = process.cwd();
  process.chdir(tempDir);

  stdout = [];
  stderr = [];
  exitCodes = [];

  logSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.join(' '));
  });
  errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.join(' '));
  });
  exitSpy = spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCodes.push(code);
    throw new ExitSignal(code);
  }) as never);
});

afterEach(async () => {
  syncCheckSpy?.mockRestore();
  logSpy.mockRestore();
  errorSpy.mockRestore();
  exitSpy.mockRestore();
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

async function runSync(result: SyncCheckResult): Promise<void> {
  syncCheckSpy = spyOn(syncCore, 'syncCheck').mockResolvedValue(result);
  const program = new Command();
  program.exitOverride();
  syncCommand(program);
  try {
    await program.parseAsync(['node', 'omcustom', 'sync']);
  } catch (error: unknown) {
    if (!(error instanceof ExitSignal)) {
      throw error;
    }
  }
}

describe('syncCommand check: error reporting', () => {
  it('prints the error reason on stderr, exits 1, and prints no "in sync" line', async () => {
    const reason = 'no template files found under /pkg/templates';
    await runSync(makeResult({ inSync: false, error: reason }));

    expect(stderr.join('\n')).toContain(reason);
    expect(exitCodes).toEqual([1]);
    expect(stdout.join('\n')).not.toContain('in sync');
    expect(stdout.join('\n')).not.toContain('Summary:');
  });

  it('prints the snapshot-generation error reason on stderr and exits 1', async () => {
    const reason = 'cannot generate the current lockfile snapshot';
    await runSync(makeResult({ inSync: false, error: reason }));

    expect(stderr.join('\n')).toContain(reason);
    expect(exitCodes).toEqual([1]);
    expect(stdout.join('\n')).not.toContain('in sync');
  });

  it('does not print the error reason on stdout', async () => {
    const reason = 'no template files found under /pkg/templates';
    await runSync(makeResult({ inSync: false, error: reason }));

    expect(stdout.join('\n')).not.toContain(reason);
  });
});

describe('syncCommand check: error absent (output unchanged)', () => {
  it('reports in sync with summary, no stderr, and no exit call', async () => {
    await runSync(makeResult({ unchanged: 3 }));

    const out = stdout.join('\n');
    expect(out).toContain('Sync check — comparing against lockfile (v2.0.19)');
    expect(out).toContain('✓ 3 files in sync');
    expect(out).toContain('Summary: 3 unchanged, 0 modified, 0 removed, 0 added');
    expect(stderr).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it('reports drift details and exits 1 without a failure message', async () => {
    await runSync(makeResult({ inSync: false, unchanged: 2, modified: ['a.md'], added: ['b.md'] }));

    const out = stdout.join('\n');
    expect(out).toContain('modified: a.md');
    expect(out).toContain('added: b.md');
    expect(out).toContain('Summary: 2 unchanged, 1 modified, 0 removed, 1 added');
    expect(stderr).toEqual([]);
    expect(exitCodes).toEqual([1]);
  });

  it('keeps the no-lockfile message on stderr and exits 1', async () => {
    await runSync(makeResult({ inSync: false, referenceVersion: null }));

    expect(stderr.join('\n')).toContain('No lockfile found. Run omcustom init first.');
    expect(exitCodes).toEqual([1]);
  });
});
