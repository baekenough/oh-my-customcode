import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeFileHash,
  diffLockfiles,
  generateLockfile,
  LOCKFILE_NAME,
  LOCKFILE_VERSION,
  type Lockfile,
  readLockfile,
  writeLockfile,
} from '../../../src/core/lockfile.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectedSha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function makeLockfile(overrides: Partial<Lockfile> = {}): Lockfile {
  return {
    lockfileVersion: LOCKFILE_VERSION,
    generatorVersion: '0.31.0',
    generatedAt: '2025-01-01T00:00:00.000Z',
    templateVersion: '0.31.0',
    files: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('lockfile', () => {
  let tempDir: string;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-lockfile-test-'));
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  describe('computeFileHash', () => {
    it('returns the correct SHA-256 hex digest for known content', async () => {
      const content = 'hello, lockfile!';
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, content, 'utf-8');

      const hash = await computeFileHash(filePath);

      expect(hash).toBe(expectedSha256(content));
    });

    it('returns lowercase hex string', async () => {
      const filePath = join(tempDir, 'lower.txt');
      await writeFile(filePath, 'abc', 'utf-8');

      const hash = await computeFileHash(filePath);

      expect(hash).toBe(hash.toLowerCase());
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different hashes for different content', async () => {
      const fileA = join(tempDir, 'a.txt');
      const fileB = join(tempDir, 'b.txt');
      await writeFile(fileA, 'content-a', 'utf-8');
      await writeFile(fileB, 'content-b', 'utf-8');

      const hashA = await computeFileHash(fileA);
      const hashB = await computeFileHash(fileB);

      expect(hashA).not.toBe(hashB);
    });

    it('rejects when file does not exist', async () => {
      const missingPath = join(tempDir, 'does-not-exist.txt');

      await expect(computeFileHash(missingPath)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  describe('readLockfile', () => {
    it('returns null when lockfile does not exist', async () => {
      const result = await readLockfile(tempDir);

      expect(result).toBeNull();
    });

    it('reads and parses a valid lockfile', async () => {
      const lockfile = makeLockfile({
        files: {
          '.claude/rules/MUST-safety.md': {
            templateHash: 'abc123',
            size: 512,
            component: 'rules',
          },
        },
      });

      await writeFile(join(tempDir, LOCKFILE_NAME), JSON.stringify(lockfile, null, 2), 'utf-8');

      const result = await readLockfile(tempDir);

      expect(result).not.toBeNull();
      expect(result?.lockfileVersion).toBe(LOCKFILE_VERSION);
      expect(result?.files['.claude/rules/MUST-safety.md'].component).toBe('rules');
    });

    it('returns null when lockfileVersion is invalid', async () => {
      const invalid = {
        lockfileVersion: 99,
        generatorVersion: '0.1.0',
        generatedAt: '2025-01-01T00:00:00.000Z',
        templateVersion: '0.1.0',
        files: {},
      };

      await writeFile(join(tempDir, LOCKFILE_NAME), JSON.stringify(invalid, null, 2), 'utf-8');

      const result = await readLockfile(tempDir);

      expect(result).toBeNull();
    });

    it('returns null when lockfileVersion field is missing', async () => {
      const noVersion = {
        generatorVersion: '0.1.0',
        generatedAt: '2025-01-01T00:00:00.000Z',
        templateVersion: '0.1.0',
        files: {},
      };

      await writeFile(join(tempDir, LOCKFILE_NAME), JSON.stringify(noVersion, null, 2), 'utf-8');

      const result = await readLockfile(tempDir);

      expect(result).toBeNull();
    });

    it('returns null when file contains invalid JSON', async () => {
      await writeFile(join(tempDir, LOCKFILE_NAME), 'not-valid-json', 'utf-8');

      const result = await readLockfile(tempDir);

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('writeLockfile', () => {
    it('writes valid JSON to the target directory', async () => {
      const lockfile = makeLockfile({
        generatorVersion: '1.2.3',
        templateVersion: '1.2.3',
      });

      await writeLockfile(tempDir, lockfile);

      const written = await readLockfile(tempDir);
      expect(written).not.toBeNull();
      expect(written?.generatorVersion).toBe('1.2.3');
      expect(written?.lockfileVersion).toBe(LOCKFILE_VERSION);
    });

    it('writes with 2-space indentation', async () => {
      const lockfile = makeLockfile();
      await writeLockfile(tempDir, lockfile);

      const raw = await readFile(join(tempDir, LOCKFILE_NAME), 'utf-8');
      // 2-space indent: first field line should start with two spaces
      expect(raw).toContain('\n  "');
    });

    it('overwrites an existing lockfile', async () => {
      const first = makeLockfile({ generatorVersion: 'v1' });
      const second = makeLockfile({ generatorVersion: 'v2' });

      await writeLockfile(tempDir, first);
      await writeLockfile(tempDir, second);

      const result = await readLockfile(tempDir);
      expect(result?.generatorVersion).toBe('v2');
    });
  });

  // -------------------------------------------------------------------------
  describe('generateLockfile', () => {
    it('generates entries for files in component directories', async () => {
      // Create a minimal .claude/rules directory with one file
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      const content = '# Safety rule';
      await writeFile(join(rulesDir, 'MUST-safety.md'), content, 'utf-8');

      const lockfile = await generateLockfile(tempDir, '0.31.0', '0.31.0');

      expect(lockfile.lockfileVersion).toBe(LOCKFILE_VERSION);
      expect(lockfile.generatorVersion).toBe('0.31.0');
      expect(lockfile.templateVersion).toBe('0.31.0');
      expect(typeof lockfile.generatedAt).toBe('string');

      const entry = lockfile.files['.claude/rules/MUST-safety.md'];
      expect(entry).toBeDefined();
      expect(entry.component).toBe('rules');
      expect(entry.templateHash).toBe(expectedSha256(content));
      expect(entry.size).toBe(Buffer.byteLength(content, 'utf-8'));
    });

    it('uses forward slashes in file paths regardless of OS', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'lang-go-expert.md'), '# agent', 'utf-8');

      const lockfile = await generateLockfile(tempDir, '0.31.0', '0.31.0');

      const keys = Object.keys(lockfile.files);
      for (const key of keys) {
        expect(key).not.toContain('\\');
      }
    });

    it('assigns correct component for each directory', async () => {
      const componentMap: Record<string, string> = {
        '.claude/rules': 'rules',
        '.claude/agents': 'agents',
        '.claude/skills': 'skills',
        '.claude/hooks': 'hooks',
        '.claude/contexts': 'contexts',
        '.claude/ontology': 'ontology',
        guides: 'guides',
      };

      for (const [dirPath, component] of Object.entries(componentMap)) {
        const fullDir = join(tempDir, dirPath);
        await mkdir(fullDir, { recursive: true });
        await writeFile(join(fullDir, `${component}.md`), `# ${component}`, 'utf-8');
      }

      const lockfile = await generateLockfile(tempDir, '0.31.0', '0.31.0');

      for (const [dirPath, expectedComponent] of Object.entries(componentMap)) {
        const fileName = `${expectedComponent}.md`;
        const entryKey = `${dirPath}/${fileName}`;
        expect(lockfile.files[entryKey]?.component).toBe(expectedComponent);
      }
    });

    it('skips missing component directories without error', async () => {
      // Create only one component directory
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# rule', 'utf-8');

      // All other component dirs are absent — should not throw
      const lockfile = await generateLockfile(tempDir, '0.31.0', '0.31.0');

      const components = new Set(Object.values(lockfile.files).map((e) => e.component));
      expect(components.size).toBe(1);
      expect(components.has('rules')).toBe(true);
    });

    it('handles empty component directories', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      // No files written

      const lockfile = await generateLockfile(tempDir, '0.31.0', '0.31.0');

      expect(Object.keys(lockfile.files)).toHaveLength(0);
    });

    it('walks subdirectories recursively', async () => {
      const skillsDir = join(tempDir, '.claude', 'skills', 'dev-review');
      await mkdir(skillsDir, { recursive: true });
      await writeFile(join(skillsDir, 'SKILL.md'), '# skill', 'utf-8');

      const lockfile = await generateLockfile(tempDir, '0.31.0', '0.31.0');

      const key = '.claude/skills/dev-review/SKILL.md';
      expect(lockfile.files[key]).toBeDefined();
      expect(lockfile.files[key].component).toBe('skills');
    });
  });

  // -------------------------------------------------------------------------
  describe('diffLockfiles', () => {
    it('detects files added in current that are absent in base', () => {
      const base = makeLockfile({ files: {} });
      const current = makeLockfile({
        files: {
          '.claude/rules/new.md': { templateHash: 'abc', size: 10, component: 'rules' },
        },
      });

      const diff = diffLockfiles(base, current);

      expect(diff.added).toContain('.claude/rules/new.md');
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(0);
    });

    it('detects files removed from base that are absent in current', () => {
      const base = makeLockfile({
        files: {
          '.claude/rules/old.md': { templateHash: 'abc', size: 10, component: 'rules' },
        },
      });
      const current = makeLockfile({ files: {} });

      const diff = diffLockfiles(base, current);

      expect(diff.removed).toContain('.claude/rules/old.md');
      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(0);
    });

    it('detects files with changed hashes as modified', () => {
      const sharedPath = '.claude/agents/lang-go-expert.md';
      const base = makeLockfile({
        files: {
          [sharedPath]: { templateHash: 'hash-v1', size: 100, component: 'agents' },
        },
      });
      const current = makeLockfile({
        files: {
          [sharedPath]: { templateHash: 'hash-v2', size: 110, component: 'agents' },
        },
      });

      const diff = diffLockfiles(base, current);

      expect(diff.modified).toContain(sharedPath);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(0);
    });

    it('puts files with identical hashes in unchanged', () => {
      const sharedPath = '.claude/rules/MUST-safety.md';
      const entry = { templateHash: 'same-hash', size: 50, component: 'rules' };
      const base = makeLockfile({ files: { [sharedPath]: entry } });
      const current = makeLockfile({ files: { [sharedPath]: entry } });

      const diff = diffLockfiles(base, current);

      expect(diff.unchanged).toContain(sharedPath);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('correctly categorizes a mixed diff', () => {
      const base = makeLockfile({
        files: {
          'a.md': { templateHash: 'h1', size: 1, component: 'rules' },
          'b.md': { templateHash: 'h2', size: 2, component: 'rules' },
          'c.md': { templateHash: 'h3', size: 3, component: 'rules' },
        },
      });
      const current = makeLockfile({
        files: {
          // a.md: same hash → unchanged
          'a.md': { templateHash: 'h1', size: 1, component: 'rules' },
          // b.md: different hash → modified
          'b.md': { templateHash: 'h2-updated', size: 20, component: 'rules' },
          // c.md removed, d.md added
          'd.md': { templateHash: 'h4', size: 4, component: 'rules' },
        },
      });

      const diff = diffLockfiles(base, current);

      expect(diff.unchanged).toEqual(['a.md']);
      expect(diff.modified).toEqual(['b.md']);
      expect(diff.removed).toEqual(['c.md']);
      expect(diff.added).toEqual(['d.md']);
    });

    it('returns empty arrays when both lockfiles are identical', () => {
      const files = {
        '.claude/rules/MUST-safety.md': { templateHash: 'abc', size: 10, component: 'rules' },
      };
      const base = makeLockfile({ files });
      const current = makeLockfile({ files });

      const diff = diffLockfiles(base, current);

      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(1);
    });

    it('handles empty base and current lockfiles', () => {
      const diff = diffLockfiles(makeLockfile(), makeLockfile());

      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(0);
    });
  });
});
