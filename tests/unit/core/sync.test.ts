/**
 * Unit tests for the sync module (drift detection and snapshot export)
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

/** Create a temporary template root containing the given relative files. */
async function makeTemplateRoot(paths: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'omcustom-sync-tpl-'));
  for (const path of paths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `template ${path}`, 'utf-8');
  }
  return root;
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

    it('detects template-owned files added after install', async () => {
      const templateRoot = await makeTemplateRoot([
        '.claude/rules/MUST-safety.md',
        '.claude/rules/MUST-new.md',
      ]);
      try {
        // Create lockfile when only one file exists
        const rulesDir = join(tempDir, '.claude', 'rules');
        await mkdir(rulesDir, { recursive: true });
        await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');

        const { generateLockfile } = await import('../../../src/core/lockfile.js');
        const lockfile = await generateLockfile(tempDir, '0.72.0', '0.72.0', { templateRoot });
        await writeLockfile(tempDir, lockfile);

        // Add a template-owned file that was not tracked at install time
        await writeFile(join(rulesDir, 'MUST-new.md'), '# New rule', 'utf-8');

        const result = await syncCheck(tempDir, { templateRoot });

        expect(result.inSync).toBe(false);
        expect(result.added).toEqual(['.claude/rules/MUST-new.md']);
        expect(result.modified).toHaveLength(0);
        expect(result.removed).toHaveLength(0);
      } finally {
        await rm(templateRoot, { recursive: true, force: true });
      }
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

    it('returns totalTracked count of current template-owned files', async () => {
      const templateRoot = await makeTemplateRoot(['.claude/rules/a.md', '.claude/rules/b.md']);
      try {
        const rulesDir = join(tempDir, '.claude', 'rules');
        await mkdir(rulesDir, { recursive: true });
        await writeFile(join(rulesDir, 'a.md'), '# a', 'utf-8');
        await writeFile(join(rulesDir, 'b.md'), '# b', 'utf-8');
        await writeFile(join(rulesDir, 'custom.md'), '# custom', 'utf-8');

        const { generateLockfile } = await import('../../../src/core/lockfile.js');
        const lockfile = await generateLockfile(tempDir, '0.72.0', '0.72.0', { templateRoot });
        await writeLockfile(tempDir, lockfile);

        const result = await syncCheck(tempDir, { templateRoot });

        expect(result.totalTracked).toBe(2);
      } finally {
        await rm(templateRoot, { recursive: true, force: true });
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('syncCheck with template-owned lockfiles (#1935)', () => {
    let templateRoot: string;
    const entry = (hash: string) => ({ templateHash: hash, size: 1, component: 'skills' });

    beforeEach(async () => {
      templateRoot = await makeTemplateRoot(['.claude/rules/MUST-safety.md']);
    });

    afterEach(async () => {
      await rm(templateRoot, { recursive: true, force: true });
    });

    async function install(): Promise<void> {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');
      const { generateLockfile } = await import('../../../src/core/lockfile.js');
      await writeLockfile(
        tempDir,
        await generateLockfile(tempDir, '0.72.0', '0.72.0', { templateRoot })
      );
    }

    it('regression: a custom skill under a lock component does not break the sync (real templates)', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety', 'utf-8');
      const { generateAndWriteLockfileForDir } = await import('../../../src/core/lockfile.js');
      await generateAndWriteLockfileForDir(tempDir);
      await mkdir(join(tempDir, '.claude', 'skills', 'my-skill'), { recursive: true });
      await writeFile(join(tempDir, '.claude', 'skills', 'my-skill', 'SKILL.md'), '# mine');

      const result = await syncCheck(tempDir);

      expect(result.inSync).toBe(true);
      expect(result.added).toHaveLength(0);
    });

    it('new-format lock plus a custom skill is in sync', async () => {
      await install();
      await mkdir(join(tempDir, '.claude', 'skills', 'my-skill'), { recursive: true });
      await writeFile(join(tempDir, '.claude', 'skills', 'my-skill', 'SKILL.md'), '# mine');

      const result = await syncCheck(tempDir, { templateRoot });

      expect(result.inSync).toBe(true);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.unchanged).toBe(1);
      expect(result.totalTracked).toBe(1);
    });

    it('old-format lock listing a custom file and a leftover is in sync', async () => {
      await install();
      const lock = JSON.parse(await readFile(join(tempDir, LOCKFILE_NAME), 'utf-8')) as Lockfile;
      // Custom file still on disk, leftover no longer on disk and not shipped by templates
      lock.files['.claude/skills/my-skill/SKILL.md'] = entry('custom-hash');
      lock.files['.claude/skills/old-leftover/SKILL.md'] = entry('left-hash');
      await writeFile(join(tempDir, LOCKFILE_NAME), JSON.stringify(lock), 'utf-8');
      await mkdir(join(tempDir, '.claude', 'skills', 'my-skill'), { recursive: true });
      await writeFile(join(tempDir, '.claude', 'skills', 'my-skill', 'SKILL.md'), '# mine');

      const result = await syncCheck(tempDir, { templateRoot });

      expect(result.inSync).toBe(true);
      expect(result.removed).toHaveLength(0);
      expect(result.added).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });

    it('still detects a modified template-owned file (positive control)', async () => {
      await install();
      await writeFile(join(tempDir, '.claude', 'rules', 'MUST-safety.md'), '# Changed', 'utf-8');

      const result = await syncCheck(tempDir, { templateRoot });

      expect(result.inSync).toBe(false);
      expect(result.modified).toEqual(['.claude/rules/MUST-safety.md']);
    });

    it('reports a template-owned file deleted from disk as removed', async () => {
      await install();
      await rm(join(tempDir, '.claude', 'rules', 'MUST-safety.md'));

      const result = await syncCheck(tempDir, { templateRoot });

      expect(result.inSync).toBe(false);
      expect(result.removed).toEqual(['.claude/rules/MUST-safety.md']);
      expect(result.added).toHaveLength(0);
    });

    it('--reference compares the unfiltered snapshot (custom file reported as added)', async () => {
      await install();
      const refDir = await mkdtemp(join(tmpdir(), 'omcustom-sync-ref-'));
      try {
        await writeFile(join(refDir, LOCKFILE_NAME), await readFile(join(tempDir, LOCKFILE_NAME)));
        await mkdir(join(tempDir, '.claude', 'skills', 'my-skill'), { recursive: true });
        await writeFile(join(tempDir, '.claude', 'skills', 'my-skill', 'SKILL.md'), '# mine');

        const result = await syncCheck(tempDir, { reference: refDir, templateRoot });

        expect(result.inSync).toBe(false);
        expect(result.added).toEqual(['.claude/skills/my-skill/SKILL.md']);
      } finally {
        await rm(refDir, { recursive: true, force: true });
      }
    });

    it('ignores a lock entry the updater carried for a leftover that is still on disk', async () => {
      await install();
      const leftover = '.claude/skills/old-leftover/SKILL.md';
      await mkdir(join(tempDir, dirname(leftover)), { recursive: true });
      await writeFile(join(tempDir, leftover), 'shipped once');
      const lock = JSON.parse(await readFile(join(tempDir, LOCKFILE_NAME), 'utf-8')) as Lockfile;
      lock.files[leftover] = entry('carried-hash');
      await writeFile(join(tempDir, LOCKFILE_NAME), JSON.stringify(lock), 'utf-8');

      const result = await syncCheck(tempDir, { templateRoot });

      expect(result.inSync).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.totalTracked).toBe(1);
    });

    for (const [label, makeRoot] of [
      ['an empty', () => mkdtemp(join(tmpdir(), 'omcustom-sync-empty-tpl-'))],
      ['a missing', async () => join(tempDir, 'no-such-templates')],
    ] as const) {
      it(`reports ${label} template directory as an error, not as in sync`, async () => {
        await install();
        const root = await makeRoot();
        try {
          const result = await syncCheck(tempDir, { templateRoot: root });

          expect(result.inSync).toBe(false);
          expect(result.error).toBe(`no template files found under ${root}`);
          expect(result.referenceVersion).toBe('0.72.0');
          expect(result.totalTracked).toBe(0);
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      });
    }

    it('reports why when the current snapshot cannot be generated', async () => {
      await install();
      const lockfileModule = await import('../../../src/core/lockfile.js');
      const spy = spyOn(lockfileModule, 'generateLockfile').mockRejectedValue(new Error('boom'));
      try {
        const result = await syncCheck(tempDir, { templateRoot });

        expect(result.inSync).toBe(false);
        expect(result.error).toBe('cannot generate the current lockfile snapshot');
        expect(result.referenceVersion).toBe('0.72.0');
      } finally {
        spy.mockRestore();
      }
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
