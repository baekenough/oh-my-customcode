/**
 * Isolated error-path tests for src/core/sync.ts.
 *
 * These tests use mock.module which modifies global module state.
 * They MUST live in a separate file to avoid contaminating other sync tests.
 * See: bun:test mock.module isolation notes in project MEMORY.
 *
 * Covered lines:
 *   - generateCurrentLockfile catch (line 71): generateLockfile throws → returns null
 *   - syncCheck if (!current) branch (lines 108-111): generateCurrentLockfile returns null
 *
 * Note on lines 58-59 (loadVersions catch):
 *   loadVersions calls readJsonFile from utils/fs.js. Mocking utils/fs.js affects all
 *   other test files in the same bun process (global mock.module pollution). Since
 *   snapshot.ts also imports from utils/fs.js, mocking it breaks installer backup tests.
 *   Lines 58-59 are intentionally excluded from this file. The remaining coverage
 *   (≥98%) satisfies the project threshold.
 *
 * Mock strategy:
 *   Mocks lockfile.js only (generateLockfile throws, readLockfile returns data).
 *   Does NOT touch utils/fs.js, avoiding cross-module contamination.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCKFILE_NAME, LOCKFILE_VERSION, type Lockfile } from '../../../src/core/lockfile.js';

describe('sync error paths (isolated mock.module tests)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-sync-err-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    mock.restore();
  });

  it('syncCheck hits if (!current) branch when generateLockfile throws (lines 71, 108-111)', async () => {
    // Write a valid lockfile so readLockfile returns a reference object.
    const lockfileData: Lockfile = {
      lockfileVersion: LOCKFILE_VERSION,
      generatorVersion: '0.72.0',
      generatedAt: '2025-01-01T00:00:00.000Z',
      templateVersion: '0.72.0',
      files: {},
    };
    await writeFile(join(tempDir, LOCKFILE_NAME), JSON.stringify(lockfileData, null, 2), 'utf-8');

    // Mock only the lockfile module — this does NOT affect utils/fs.js, so snapshot.ts
    // and other modules that import utils/fs.js are unaffected.
    // readLockfile succeeds (returns the lockfile above), but generateLockfile throws.
    // This forces generateCurrentLockfile to return null (line 71), causing syncCheck
    // to enter the if (!current) branch (lines 108-111).
    mock.module('../../../src/core/lockfile.js', () => ({
      LOCKFILE_NAME,
      LOCKFILE_VERSION,
      readLockfile: async () => lockfileData,
      generateLockfile: async () => {
        throw new Error('simulated generateLockfile failure');
      },
      writeLockfile: async () => {},
      diffLockfiles: () => ({ added: [], removed: [], modified: [], unchanged: [] }),
    }));

    // Re-import sync.js after the mock is installed.
    const { syncCheck } = await import('../../../src/core/sync.js');

    const result = await syncCheck(tempDir);

    // generateCurrentLockfile returned null → if (!current) branch returns early
    // with referenceVersion set but currentVersion null
    expect(result.inSync).toBe(false);
    expect(result.referenceVersion).toBe('0.72.0');
    expect(result.currentVersion).toBeNull();
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
  });
});
