/**
 * Unit tests for the sync module (drift detection and snapshot export)
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LOCKFILE_NAME,
  LOCKFILE_VERSION,
  type Lockfile,
  writeLockfile,
} from '../../../src/core/lockfile.js';
import { exportSnapshot, syncCheck } from '../../../src/core/sync.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLockfile(overrides: Partial<Lockfile> = {}): Lockfile {
  return {
    lockfileVersion: LOCKFILE_VERSION,
    generatorVersion: '0.72.0',
    generatedAt: '2025-01-01T00:00:00.000Z',
    templateVersion: '0.72.0',
    files: {},
    ...overrides,
  };
}

async function writeTestLockfile(dir: string, overrides: Partial<Lockfile> = {}): Promise<void> {
  const lockfile = makeLockfile(overrides);
  await writeFile(join(dir, LOCKFILE_NAME), JSON.stringify(lockfile, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sync', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-sync-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  describe('syncCheck', () => {
    it('returns inSync: false with null versions when no lockfile exists', async () => {
      const result = await syncCheck(tempDir);

      expect(result.inSync).toBe(false);
      expect(result.referenceVersion).toBeNull();
      expect(result.currentVersion).toBeNull();
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });

    it('reports inSync: true when current state matches lockfile exactly', async () => {
      // Create a rules directory with one file
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');

      // Write a lockfile that was generated from the same state
      // We use writeLockfile (via the core module) after generating it
      const { generateLockfile } = await import('../../../src/core/lockfile.js');
      const lockfile = await generateLockfile(tempDir, '0.72.0', '0.72.0');
      await writeLockfile(tempDir, lockfile);

      const result = await syncCheck(tempDir);

      expect(result.inSync).toBe(true);
      expect(result.unchanged).toBeGreaterThan(0);
      expect(result.modified).toHaveLength(0);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });

    it('detects files modified since install', async () => {
      // Create a file and record its hash in the lockfile
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), 'original content', 'utf-8');

      const { generateLockfile } = await import('../../../src/core/lockfile.js');
      const lockfile = await generateLockfile(tempDir, '0.72.0', '0.72.0');
      await writeLockfile(tempDir, lockfile);

      // Modify the file after recording the lockfile
      await writeFile(join(rulesDir, 'MUST-safety.md'), 'modified content', 'utf-8');

      const result = await syncCheck(tempDir);

      expect(result.inSync).toBe(false);
      expect(result.modified).toContain('.claude/rules/MUST-safety.md');
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });

    it('detects files added after install', async () => {
      // Create lockfile when only one file exists
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');

      const { generateLockfile } = await import('../../../src/core/lockfile.js');
      const lockfile = await generateLockfile(tempDir, '0.72.0', '0.72.0');
      await writeLockfile(tempDir, lockfile);

      // Add a new file that was not tracked at install time
      await writeFile(join(rulesDir, 'MUST-new.md'), '# New rule', 'utf-8');

      const result = await syncCheck(tempDir);

      expect(result.inSync).toBe(false);
      expect(result.added).toContain('.claude/rules/MUST-new.md');
      expect(result.modified).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });

    it('detects files removed after install', async () => {
      // Create lockfile with two files
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');
      await writeFile(join(rulesDir, 'MUST-permissions.md'), '# Permissions', 'utf-8');

      const { generateLockfile } = await import('../../../src/core/lockfile.js');
      const lockfile = await generateLockfile(tempDir, '0.72.0', '0.72.0');
      await writeLockfile(tempDir, lockfile);

      // Remove one of the tracked files
      await rm(join(rulesDir, 'MUST-permissions.md'));

      const result = await syncCheck(tempDir);

      expect(result.inSync).toBe(false);
      expect(result.removed).toContain('.claude/rules/MUST-permissions.md');
      expect(result.modified).toHaveLength(0);
    });

    it('uses external reference directory when provided', async () => {
      // Create a reference snapshot directory with its own lockfile
      const refDir = await mkdtemp(join(tmpdir(), 'omcustom-sync-ref-'));

      try {
        // Reference lockfile records one file
        const refLockfile = makeLockfile({
          generatorVersion: '0.70.0',
          files: {
            '.claude/rules/MUST-safety.md': {
              templateHash: 'different-hash',
              size: 100,
              component: 'rules',
            },
          },
        });
        await writeFile(join(refDir, LOCKFILE_NAME), JSON.stringify(refLockfile, null, 2), 'utf-8');

        // Current state has the same file but with a different hash
        const rulesDir = join(tempDir, '.claude', 'rules');
        await mkdir(rulesDir, { recursive: true });
        await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');

        const result = await syncCheck(tempDir, { reference: refDir });

        expect(result.referenceVersion).toBe('0.70.0');
        // The file exists in both but hashes differ → modified
        expect(result.modified).toContain('.claude/rules/MUST-safety.md');
      } finally {
        await rm(refDir, { recursive: true, force: true });
      }
    });

    it('returns referenceVersion from lockfile when present', async () => {
      await writeTestLockfile(tempDir, { generatorVersion: '0.55.0' });

      // No .claude/ directory — current generation produces empty files
      const result = await syncCheck(tempDir);

      expect(result.referenceVersion).toBe('0.55.0');
    });

    it('returns totalTracked count of current files', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'a.md'), '# a', 'utf-8');
      await writeFile(join(rulesDir, 'b.md'), '# b', 'utf-8');

      const { generateLockfile } = await import('../../../src/core/lockfile.js');
      const lockfile = await generateLockfile(tempDir, '0.72.0', '0.72.0');
      await writeLockfile(tempDir, lockfile);

      const result = await syncCheck(tempDir);

      expect(result.totalTracked).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  describe('exportSnapshot', () => {
    it('returns success: false when no .claude/ directory exists', async () => {
      const outputDir = join(tempDir, 'snapshot');
      const result = await exportSnapshot(tempDir, outputDir);

      expect(result.success).toBe(false);
      expect(result.fileCount).toBe(0);
    });

    it('creates the output directory and copies .claude/ contents', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');

      const outputDir = join(tempDir, 'snapshot');
      const result = await exportSnapshot(tempDir, outputDir);

      expect(result.success).toBe(true);
      expect(result.exportPath).toBe(outputDir);
      expect(result.fileCount).toBeGreaterThan(0);
    });

    it('includes a lockfile in the exported snapshot', async () => {
      const { existsSync } = await import('node:fs');
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');

      const outputDir = join(tempDir, 'snapshot');
      await exportSnapshot(tempDir, outputDir);

      expect(existsSync(join(outputDir, LOCKFILE_NAME))).toBe(true);
    });

    it('excludes agent-memory directories from the snapshot', async () => {
      const { existsSync } = await import('node:fs');

      // Create .claude/rules (tracked) and .claude/agent-memory (excluded)
      const rulesDir = join(tempDir, '.claude', 'rules');
      const memoryDir = join(tempDir, '.claude', 'agent-memory', 'lang-typescript-expert');
      await mkdir(rulesDir, { recursive: true });
      await mkdir(memoryDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');
      await writeFile(join(memoryDir, 'MEMORY.md'), '# Memory', 'utf-8');

      const outputDir = join(tempDir, 'snapshot');
      await exportSnapshot(tempDir, outputDir);

      expect(existsSync(join(outputDir, '.claude', 'rules', 'MUST-safety.md'))).toBe(true);
      expect(existsSync(join(outputDir, '.claude', 'agent-memory'))).toBe(false);
    });

    it('excludes outputs directory from the snapshot', async () => {
      const { existsSync } = await import('node:fs');

      const rulesDir = join(tempDir, '.claude', 'rules');
      const outputsDir = join(tempDir, '.claude', 'outputs', 'sessions');
      await mkdir(rulesDir, { recursive: true });
      await mkdir(outputsDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');
      await writeFile(join(outputsDir, 'session.md'), '# Session log', 'utf-8');

      const outputDir = join(tempDir, 'snapshot');
      await exportSnapshot(tempDir, outputDir);

      expect(existsSync(join(outputDir, '.claude', 'rules', 'MUST-safety.md'))).toBe(true);
      expect(existsSync(join(outputDir, '.claude', 'outputs'))).toBe(false);
    });

    it('includes guides/ directory when present', async () => {
      const { existsSync } = await import('node:fs');

      const rulesDir = join(tempDir, '.claude', 'rules');
      const guidesDir = join(tempDir, 'guides', 'typescript');
      await mkdir(rulesDir, { recursive: true });
      await mkdir(guidesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');
      await writeFile(join(guidesDir, 'guide.md'), '# TS Guide', 'utf-8');

      const outputDir = join(tempDir, 'snapshot');
      await exportSnapshot(tempDir, outputDir);

      expect(existsSync(join(outputDir, 'guides', 'typescript', 'guide.md'))).toBe(true);
    });

    it('succeeds without guides/ directory when it is absent', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');

      const outputDir = join(tempDir, 'snapshot');
      const result = await exportSnapshot(tempDir, outputDir);

      // No guides/ dir — should still succeed
      expect(result.success).toBe(true);
    });

    it('reports the correct exported file count', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'a.md'), '# a', 'utf-8');
      await writeFile(join(rulesDir, 'b.md'), '# b', 'utf-8');

      const outputDir = join(tempDir, 'snapshot');
      const result = await exportSnapshot(tempDir, outputDir);

      // At minimum: a.md + b.md + lockfile
      expect(result.fileCount).toBeGreaterThanOrEqual(3);
    });
  });
});
