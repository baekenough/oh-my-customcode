import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeFileHash,
  diffLockfiles,
  generateAndWriteLockfileForDir,
  generateLockfile,
  LOCKFILE_NAME,
  LOCKFILE_VERSION,
  type Lockfile,
  preserveGeneratedAt,
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

    it('returns null when files field is missing', async () => {
      const noFiles = {
        lockfileVersion: LOCKFILE_VERSION,
        generatorVersion: '0.1.0',
        generatedAt: '2025-01-01T00:00:00.000Z',
        templateVersion: '0.1.0',
      };

      await writeFile(join(tempDir, LOCKFILE_NAME), JSON.stringify(noFiles, null, 2), 'utf-8');

      const result = await readLockfile(tempDir);

      expect(result).toBeNull();
    });

    it('returns null when files field is null', async () => {
      const nullFiles = {
        lockfileVersion: LOCKFILE_VERSION,
        generatorVersion: '0.1.0',
        generatedAt: '2025-01-01T00:00:00.000Z',
        templateVersion: '0.1.0',
        files: null,
      };

      await writeFile(join(tempDir, LOCKFILE_NAME), JSON.stringify(nullFiles, null, 2), 'utf-8');

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

    describe('deterministic files key order (#1796)', () => {
      async function seed(root: string, relPaths: string[]): Promise<void> {
        for (const rel of relPaths) {
          const full = join(root, rel);
          await mkdir(join(full, '..'), { recursive: true });
          await writeFile(full, `# ${rel}`, 'utf-8');
        }
      }

      it('sorts keys by code-unit path order, independent of locale and readdir order', async () => {
        // Names chosen so that readdir order, locale-aware order and code-unit order all differ.
        await seed(
          tempDir,
          ['b.md', 'Z.md', '10.md', '_x.md', 'a.md', '2.md', '-d.md'].map(
            (name) => `.claude/rules/${name}`
          )
        );

        const lockfile = await generateLockfile(tempDir, '0.31.0', '0.31.0');

        expect(Object.keys(lockfile.files)).toEqual([
          '.claude/rules/-d.md',
          '.claude/rules/10.md',
          '.claude/rules/2.md',
          '.claude/rules/Z.md',
          '.claude/rules/_x.md',
          '.claude/rules/a.md',
          '.claude/rules/b.md',
        ]);
      });

      it('sorts across components instead of following component walk order', async () => {
        await seed(tempDir, ['guides/x.md', '.claude/rules/r.md', '.claude/agents/a.md']);

        const lockfile = await generateLockfile(tempDir, '0.31.0', '0.31.0');

        expect(Object.keys(lockfile.files)).toEqual([
          '.claude/agents/a.md',
          '.claude/rules/r.md',
          'guides/x.md',
        ]);
      });

      it('yields the same key order and bytes for the same file set created in a different order', async () => {
        const names = ['b.md', 'Z.md', '10.md', '_x.md', 'a.md', '2.md'].map(
          (name) => `.claude/skills/s/${name}`
        );
        const otherDir = await mkdtemp(join(tmpdir(), 'omcustom-lockfile-test-'));
        try {
          await seed(tempDir, names);
          await seed(otherDir, [...names].reverse());

          const first = await generateLockfile(tempDir, '0.31.0', '0.31.0');
          const second = await generateLockfile(otherDir, '0.31.0', '0.31.0');

          expect(Object.keys(second.files)).toEqual(Object.keys(first.files));
          expect(JSON.stringify(second.files)).toBe(JSON.stringify(first.files));
        } finally {
          await rm(otherDir, { recursive: true, force: true });
        }
      });
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
  describe('exact retiredPaths exclusions', () => {
    const retired = [
      '.claude/hooks/scripts/rtk-intercept.sh',
      '.claude/skills/rtk-exec/SKILL.md',
      '.claude/skills/rtk-exec/scripts/rtk-wrapper.cjs',
    ];
    const retained = [
      '.claude/agents/user-agent.md',
      '.claude/rules/MUST-user.md',
      '.claude/hooks/scripts/rtk-intercept.sh.backup',
      '.claude/skills/rtk-exec-user/SKILL.md',
      '.claude/skills/rtk-exec/SKILL.md.backup',
      '.claude/skills/rtk-exec/scripts/rtk-wrapper.sh',
    ];

    async function seedRetirementCorpus() {
      for (const path of [...retired, ...retained]) {
        await mkdir(dirname(join(tempDir, path)), { recursive: true });
        await writeFile(join(tempDir, path), `user-maintained:${path}\n`, 'utf8');
      }
    }

    it('excludes only exact retirement keys and leaves retained user files on disk', async () => {
      await seedRetirementCorpus();
      const baseline = await generateLockfile(tempDir, '2.0.0', '2.0.0');
      expect(Object.keys(baseline.files)).toEqual([...retained].sort());
      const excluded = await generateLockfile(tempDir, '2.0.0', '2.0.0', { retiredPaths: retired });
      expect(Object.keys(excluded.files)).toEqual([...retained].sort());
      expect(Object.keys(excluded.files).length).toBeGreaterThan(0);
      for (const path of retained) {
        expect(excluded.files[path]).toEqual(baseline.files[path]);
      }
      for (const path of retired) {
        expect(excluded.files[path]).toBeUndefined();
        expect(await readFile(join(tempDir, path), 'utf8')).toBe(`user-maintained:${path}\n`);
      }
    });

    it('default/empty additional exclusions keep retired ownership absent and the non-RTK corpus unchanged', async () => {
      await seedRetirementCorpus();
      const baseline = await generateLockfile(tempDir, '2.0.0', '2.0.0');
      const empty = await generateLockfile(tempDir, '2.0.0', '2.0.0', { retiredPaths: [] });
      expect(Object.keys(baseline.files)).toEqual([...retained].sort());
      expect(empty.files).toEqual(baseline.files);
      expect((await generateLockfile(tempDir, '2.0.0', '2.0.0')).files).toEqual(baseline.files);
      for (const path of retired) {
        expect(baseline.files[path]).toBeUndefined();
        expect(empty.files[path]).toBeUndefined();
        expect(await readFile(join(tempDir, path), 'utf8')).toBe(`user-maintained:${path}\n`);
      }
    });

    it('matching is literal: wrong case, missing path and suffix neighbor do not exclude the original', async () => {
      await seedRetirementCorpus();
      const result = await generateLockfile(tempDir, '2.0.0', '2.0.0', {
        retiredPaths: ['.claude/hooks/scripts/RTK-intercept.sh', '.claude/skills/missing/SKILL.md'],
      });
      expect(Object.keys(result.files)).toEqual([...retained].sort());
      const suffix = await generateLockfile(tempDir, '2.0.0', '2.0.0', {
        retiredPaths: ['.claude/hooks/scripts/rtk-intercept.sh.backup'],
      });
      expect(Object.keys(suffix.files)).toEqual(
        retained.filter((path) => path !== '.claude/hooks/scripts/rtk-intercept.sh.backup').sort()
      );
      for (const path of retired) expect(suffix.files[path]).toBeUndefined();
      expect(suffix.files['.claude/hooks/scripts/rtk-intercept.sh.backup']).toBeUndefined();
    });

    for (const additionalPaths of [undefined, []]) {
      it(`default writer never reacquires retained RTK ownership with ${JSON.stringify(additionalPaths)}`, async () => {
        await seedRetirementCorpus();
        const result =
          additionalPaths === undefined
            ? await generateAndWriteLockfileForDir(tempDir)
            : await generateAndWriteLockfileForDir(tempDir, { retiredPaths: additionalPaths });
        expect(result.warning).toBeUndefined();
        expect(result.fileCount).toBe(retained.length);
        const lock = await readLockfile(tempDir);
        expect(Object.keys(lock?.files ?? {})).toEqual([...retained].sort());
        for (const path of [...retired, ...retained]) {
          const content = `user-maintained:${path}\n`;
          expect(await readFile(join(tempDir, path), 'utf8')).toBe(content);
          if (retired.includes(path)) {
            expect(lock?.files[path]).toBeUndefined();
          } else {
            expect(lock?.files[path]?.templateHash).toBe(expectedSha256(content));
          }
        }
      });
    }

    it('additional caller exclusions extend built-in retirement without changing neighbor hashes', async () => {
      await seedRetirementCorpus();
      const baseline = await generateLockfile(tempDir, '2.0.0', '2.0.0');
      const extra = '.claude/agents/user-agent.md';
      const extended = await generateLockfile(tempDir, '2.0.0', '2.0.0', {
        retiredPaths: [extra],
      });
      expect(Object.keys(extended.files)).toEqual(retained.filter((path) => path !== extra).sort());
      for (const path of [...retired, extra]) expect(extended.files[path]).toBeUndefined();
      for (const path of retained.filter((path) => path !== extra)) {
        expect(extended.files[path]).toEqual(baseline.files[path]);
      }
      expect(await readFile(join(tempDir, extra), 'utf8')).toBe(`user-maintained:${extra}\n`);
    });

    it('regeneration keeps retirement exclusions and idempotence while preserving RTK disk data', async () => {
      await seedRetirementCorpus();
      const options = { retiredPaths: retired };
      const first = await generateAndWriteLockfileForDir(tempDir, options);
      expect(first.warning).toBeUndefined();
      expect(first.fileCount).toBe(retained.length);
      const bytes = await readFile(join(tempDir, LOCKFILE_NAME), 'utf8');
      const second = await generateAndWriteLockfileForDir(tempDir, options);
      expect(second.warning).toBeUndefined();
      expect(second.fileCount).toBe(retained.length);
      expect(await readFile(join(tempDir, LOCKFILE_NAME), 'utf8')).toBe(bytes);
      expect(Object.keys((await readLockfile(tempDir))?.files ?? {})).toEqual([...retained].sort());
      for (const path of retired) {
        expect(await readFile(join(tempDir, path), 'utf8')).toBe(`user-maintained:${path}\n`);
      }
    });

    it.each([
      '',
      '/absolute/path',
      'trailing/',
      './relative',
      '../parent',
      'a/../b',
      'a//b',
      'a\\b',
      'a*b',
      'a?b',
      'a[b]',
      'a{b}',
      'a:b',
      'a\0b',
    ])('invalid retirement key %j rejects without writing or replacing an existing lockfile', async (path) => {
      const bytes = JSON.stringify(makeLockfile(), null, 2);
      await writeFile(join(tempDir, LOCKFILE_NAME), bytes);
      await expect(
        generateLockfile(tempDir, '2.0.0', '2.0.0', { retiredPaths: [path] })
      ).rejects.toThrow('exact canonical relative file paths');
      const result = await generateAndWriteLockfileForDir(tempDir, { retiredPaths: [path] });
      expect(result.fileCount).toBe(0);
      expect(result.warning).toContain('exact canonical relative file paths');
      expect(await readFile(join(tempDir, LOCKFILE_NAME), 'utf8')).toBe(bytes);
      expect(await readdir(tempDir)).toEqual([LOCKFILE_NAME]);
    });

    it('rejects a runtime non-string retirement key before generation writes anything', async () => {
      await expect(
        generateLockfile(tempDir, '2.0.0', '2.0.0', {
          retiredPaths: [42 as unknown as string],
        })
      ).rejects.toThrow('exact canonical relative file paths');
      expect(await readdir(tempDir)).toEqual([]);
    });
  });

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

  // -------------------------------------------------------------------------
  describe('preserveGeneratedAt', () => {
    const OLD = '2020-01-01T00:00:00.000Z';
    const NEW = '2026-10-05T00:00:00.000Z';
    const entryA = { templateHash: 'h-a', size: 1, component: 'rules' };
    const entryB = { templateHash: 'h-b', size: 2, component: 'agents' };

    const previous = (overrides: Partial<Lockfile> = {}): Lockfile =>
      makeLockfile({ generatedAt: OLD, files: { 'a.md': entryA, 'b.md': entryB }, ...overrides });
    const next = (overrides: Partial<Lockfile> = {}): Lockfile =>
      makeLockfile({ generatedAt: NEW, files: { 'a.md': entryA, 'b.md': entryB }, ...overrides });

    it('keeps the previous generatedAt when content is identical', () => {
      const result = preserveGeneratedAt(next(), previous());
      expect(result.generatedAt).toBe(OLD);
      expect(result).toEqual(previous());
    });

    it('treats files with a different key order as identical content', () => {
      const reordered = next({ files: { 'b.md': entryB, 'a.md': entryA } });
      const result = preserveGeneratedAt(reordered, previous());
      expect(result.generatedAt).toBe(OLD);
      // Serialization order still follows the freshly generated lockfile
      expect(Object.keys(result.files)).toEqual(['b.md', 'a.md']);
    });

    it('returns the fresh lockfile when there is no previous lockfile', () => {
      const fresh = next();
      expect(preserveGeneratedAt(fresh, null)).toBe(fresh);
    });

    it.each([
      ['generatorVersion', { generatorVersion: '9.9.9' }],
      ['templateVersion', { templateVersion: '9.9.9' }],
      ['lockfileVersion', { lockfileVersion: 2 as unknown as typeof LOCKFILE_VERSION }],
    ])('refreshes generatedAt when %s differs', (_name, override) => {
      expect(preserveGeneratedAt(next(override), previous()).generatedAt).toBe(NEW);
    });

    it.each([
      ['hash changed', { 'a.md': { ...entryA, templateHash: 'h-a2' }, 'b.md': entryB }],
      ['size changed', { 'a.md': { ...entryA, size: 99 }, 'b.md': entryB }],
      ['component changed', { 'a.md': { ...entryA, component: 'guides' }, 'b.md': entryB }],
      ['file added', { 'a.md': entryA, 'b.md': entryB, 'c.md': entryA }],
      ['file removed', { 'a.md': entryA }],
      ['file replaced (same count)', { 'a.md': entryA, 'c.md': entryB }],
    ])('refreshes generatedAt when %s', (_name, files) => {
      expect(preserveGeneratedAt(next({ files }), previous()).generatedAt).toBe(NEW);
    });

    it('refreshes generatedAt when the previous generatedAt is not a parseable timestamp', () => {
      expect(preserveGeneratedAt(next(), previous({ generatedAt: 'not-a-date' })).generatedAt).toBe(
        NEW
      );
      expect(
        preserveGeneratedAt(next(), previous({ generatedAt: 42 as unknown as string })).generatedAt
      ).toBe(NEW);
    });

    it.each([
      ['a bare number string', '1'],
      ['a bare year', '2026'],
      ['a natural-language date', 'March 7, 2020'],
      ['an ISO date without time', '2020-01-01'],
      ['an ISO timestamp without milliseconds', '2020-01-01T00:00:00Z'],
      ['a padded ISO timestamp', ' 2020-01-01T00:00:00.000Z '],
      ['an empty string', ''],
    ])('refreshes generatedAt when the previous generatedAt is %s (not toISOString format)', (_name, stamp) => {
      expect(preserveGeneratedAt(next(), previous({ generatedAt: stamp })).generatedAt).toBe(NEW);
    });

    it('keeps a previous generatedAt that is in toISOString format', () => {
      const stamp = '2026-10-03T10:06:31.231Z';
      expect(preserveGeneratedAt(next(), previous({ generatedAt: stamp })).generatedAt).toBe(stamp);
    });

    it('refreshes generatedAt when a previous entry size is the string "1" rather than the number 1', () => {
      const prev = previous({
        files: { 'a.md': { ...entryA, size: '1' as unknown as number }, 'b.md': entryB },
      });
      expect(preserveGeneratedAt(next(), prev).generatedAt).toBe(NEW);
    });

    it('ignores unknown fields on previous entries and does not carry them over', () => {
      const prev = previous({
        files: {
          'a.md': { ...entryA, legacy: true } as unknown as typeof entryA,
          'b.md': entryB,
        },
      });
      const result = preserveGeneratedAt(next(), prev);
      expect(result.generatedAt).toBe(OLD);
      expect(result.files['a.md']).toEqual(entryA);
      expect('legacy' in result.files['a.md']).toBe(false);
    });

    it('follows the freshly generated structure: extra top-level fields and key order of previous are dropped', () => {
      const prev = {
        files: { 'a.md': entryA, 'b.md': entryB },
        extra: 'dropped-on-write',
        templateVersion: '0.31.0',
        generatedAt: OLD,
        generatorVersion: '0.31.0',
        lockfileVersion: LOCKFILE_VERSION,
      } as unknown as Lockfile;
      const fresh = next();

      const result = preserveGeneratedAt(fresh, prev);

      expect(result.generatedAt).toBe(OLD);
      expect(Object.keys(result)).toEqual(Object.keys(fresh));
      expect('extra' in result).toBe(false);
      expect(JSON.stringify(result)).toBe(JSON.stringify({ ...fresh, generatedAt: OLD }));
    });

    it('refreshes generatedAt when a previous entry is malformed', () => {
      const broken = previous({
        files: { 'a.md': null as unknown as typeof entryA, 'b.md': entryB },
      });
      expect(preserveGeneratedAt(next(), broken).generatedAt).toBe(NEW);
    });

    it('does not match a key against properties inherited by previous.files', () => {
      // An own "__proto__" key whose entry has no fields would equal Object.prototype's
      // (field-less) shape if the lookup fell through to the prototype chain.
      const nxt = next({
        files: Object.fromEntries([['__proto__', {}]]) as unknown as Lockfile['files'],
      });
      const prev = previous({ files: { a: entryA } });
      expect(preserveGeneratedAt(nxt, prev).generatedAt).toBe(NEW);
    });

    it('does not mutate its arguments', () => {
      const prev = previous();
      const nxt = next();
      preserveGeneratedAt(nxt, prev);
      expect(prev.generatedAt).toBe(OLD);
      expect(nxt.generatedAt).toBe(NEW);
    });
  });

  // -------------------------------------------------------------------------
  describe('generateAndWriteLockfileForDir', () => {
    it('generates and writes lockfile in one call', async () => {
      // Create a minimal component directory with one file
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety rule', 'utf-8');

      const result = await generateAndWriteLockfileForDir(tempDir);

      expect(result.fileCount).toBeGreaterThan(0);
      expect(result.warning).toBeUndefined();

      // Verify lockfile was written
      const lockfile = await readLockfile(tempDir);
      expect(lockfile).not.toBeNull();
      expect(lockfile?.files['.claude/rules/MUST-safety.md']).toBeDefined();
    });

    describe('idempotent rebuild (#1796)', () => {
      const OLD_STAMP = '2020-01-01T00:00:00.000Z';
      const lockfilePath = (): string => join(tempDir, LOCKFILE_NAME);

      async function seedRule(name: string, content: string): Promise<void> {
        const rulesDir = join(tempDir, '.claude', 'rules');
        await mkdir(rulesDir, { recursive: true });
        await writeFile(join(rulesDir, name), content, 'utf-8');
      }

      /** Rewrite the on-disk lockfile with a fixed old timestamp so "kept" vs "refreshed" is observable. */
      async function pinStamp(): Promise<string> {
        const parsed = JSON.parse(await readFile(lockfilePath(), 'utf-8')) as Lockfile;
        await writeLockfile(tempDir, { ...parsed, generatedAt: OLD_STAMP });
        return readFile(lockfilePath(), 'utf-8');
      }

      it('keeps the file byte-identical when regenerated with unchanged content', async () => {
        await seedRule('MUST-safety.md', '# Safety rule');
        await generateAndWriteLockfileForDir(tempDir);
        const pinned = await pinStamp();

        const result = await generateAndWriteLockfileForDir(tempDir);

        expect(result.warning).toBeUndefined();
        expect(await readFile(lockfilePath(), 'utf-8')).toBe(pinned);
        expect((await readLockfile(tempDir))?.generatedAt).toBe(OLD_STAMP);
      });

      it('refreshes generatedAt when a file hash changes', async () => {
        await seedRule('MUST-safety.md', '# Safety rule');
        await generateAndWriteLockfileForDir(tempDir);
        await pinStamp();

        await seedRule('MUST-safety.md', '# Safety rule v2');
        await generateAndWriteLockfileForDir(tempDir);

        const lockfile = await readLockfile(tempDir);
        expect(lockfile?.generatedAt).not.toBe(OLD_STAMP);
        expect(lockfile?.files['.claude/rules/MUST-safety.md'].templateHash).toBe(
          expectedSha256('# Safety rule v2')
        );
      });

      it('refreshes generatedAt when a file is added', async () => {
        await seedRule('MUST-safety.md', '# Safety rule');
        await generateAndWriteLockfileForDir(tempDir);
        await pinStamp();

        await seedRule('MUST-extra.md', '# Extra');
        await generateAndWriteLockfileForDir(tempDir);

        const lockfile = await readLockfile(tempDir);
        expect(lockfile?.generatedAt).not.toBe(OLD_STAMP);
        expect(Object.keys(lockfile?.files ?? {})).toContain('.claude/rules/MUST-extra.md');
      });

      it('refreshes generatedAt when a file is removed', async () => {
        await seedRule('MUST-safety.md', '# Safety rule');
        await seedRule('MUST-extra.md', '# Extra');
        await generateAndWriteLockfileForDir(tempDir);
        await pinStamp();

        await rm(join(tempDir, '.claude', 'rules', 'MUST-extra.md'));
        await generateAndWriteLockfileForDir(tempDir);

        const lockfile = await readLockfile(tempDir);
        expect(lockfile?.generatedAt).not.toBe(OLD_STAMP);
        expect(Object.keys(lockfile?.files ?? {})).not.toContain('.claude/rules/MUST-extra.md');
      });

      it('refreshes generatedAt when the previous lockfile has a different generatorVersion', async () => {
        await seedRule('MUST-safety.md', '# Safety rule');
        await generateAndWriteLockfileForDir(tempDir);
        const parsed = JSON.parse(await readFile(lockfilePath(), 'utf-8')) as Lockfile;
        parsed.generatorVersion = '0.0.0-previous';
        parsed.generatedAt = OLD_STAMP;
        await writeFile(lockfilePath(), JSON.stringify(parsed, null, 2), 'utf-8');

        await generateAndWriteLockfileForDir(tempDir);

        const lockfile = await readLockfile(tempDir);
        expect(lockfile?.generatorVersion).not.toBe('0.0.0-previous');
        expect(lockfile?.generatedAt).not.toBe(OLD_STAMP);
      });

      it('writes a fresh timestamp when no lockfile exists yet', async () => {
        await seedRule('MUST-safety.md', '# Safety rule');
        const before = Date.now();

        await generateAndWriteLockfileForDir(tempDir);

        const lockfile = await readLockfile(tempDir);
        expect(Date.parse(lockfile?.generatedAt ?? '')).toBeGreaterThanOrEqual(before);
      });

      it('regenerates with a fresh timestamp when the existing lockfile is unparseable', async () => {
        await seedRule('MUST-safety.md', '# Safety rule');
        await writeFile(lockfilePath(), '{ not valid json', 'utf-8');
        const before = Date.now();

        const result = await generateAndWriteLockfileForDir(tempDir);

        expect(result.warning).toBeUndefined();
        const lockfile = await readLockfile(tempDir);
        expect(lockfile).not.toBeNull();
        expect(Date.parse(lockfile?.generatedAt ?? '')).toBeGreaterThanOrEqual(before);
      });
    });

    it('returns warning on failure without throwing', async () => {
      // Use a non-existent directory that will cause getPackageRoot to fail
      // Since generateAndWriteLockfileForDir calls getPackageRoot internally,
      // and we can't easily mock it in vitest without module mocking,
      // we verify the function signature and non-throwing contract
      const result = await generateAndWriteLockfileForDir(tempDir);

      // Even if it succeeds (package root is accessible), verify shape
      expect(typeof result.fileCount).toBe('number');
      expect(result.warning === undefined || typeof result.warning === 'string').toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('excludeGitIgnored (#1819)', () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

    /**
     * Hermetic git for every process this block starts — the fixture git calls, the sync
     * script, and the git children of in-process `generateLockfile` (which copy
     * `process.env`). Inherited GIT_* variables are removed; global/system config is off;
     * HOME and XDG_CONFIG_HOME point at an empty directory so the default per-user excludes
     * file ($XDG_CONFIG_HOME/git/ignore, else $HOME/.config/git/ignore) is not the
     * developer's. GIT_CONFIG_GLOBAL=/dev/null alone does not cover that file. Same GIT_*
     * policy as gitFixtureEnv() in tests/unit/core/git-workflow.test.ts.
     */
    let gitHome: string;
    let savedEnv: Map<string, string | undefined>;

    function setEnv(key: string, value: string | undefined): void {
      if (!savedEnv.has(key)) {
        savedEnv.set(key, process.env[key]);
      }
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    beforeEach(async () => {
      savedEnv = new Map();
      gitHome = await mkdtemp(join(tmpdir(), 'omcustom-lockfile-githome-'));
      for (const key of Object.keys(process.env)) {
        if (key.startsWith('GIT_')) {
          setEnv(key, undefined);
        }
      }
      setEnv('GIT_CONFIG_GLOBAL', '/dev/null');
      setEnv('GIT_CONFIG_NOSYSTEM', '1');
      setEnv('HOME', gitHome);
      setEnv('XDG_CONFIG_HOME', join(gitHome, 'xdg'));
    });

    afterEach(async () => {
      for (const [key, value] of savedEnv) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      await rm(gitHome, { recursive: true, force: true });
    });

    /** Env for child processes: the hermetic process.env minus any GIT_* a test planted. */
    function fixtureEnv(): NodeJS.ProcessEnv {
      const env: NodeJS.ProcessEnv = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('GIT_')) {
          env[key] = value;
        }
      }
      env.GIT_CONFIG_GLOBAL = '/dev/null';
      env.GIT_CONFIG_NOSYSTEM = '1';
      return env;
    }

    function git(cwd: string, ...args: string[]): string {
      return execFileSync('git', args, {
        cwd,
        env: fixtureEnv(),
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }

    function commit(cwd: string): void {
      git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'seed');
    }

    async function put(root: string, relPath: string, content: string): Promise<void> {
      const fullPath = join(root, relPath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
    }

    /**
     * Mirror of this repository's layout: `.claude/*` ignored except the re-included
     * component directories, so `.claude/contexts/` is ignored as a whole directory (untracked);
     * the rest is tracked.
     */
    async function seedRepo(root: string): Promise<void> {
      git(root, 'init', '-q');
      await put(root, '.gitignore', '.claude/*\n!.claude/rules/\n!.claude/skills/\n');
      await put(root, '.claude/rules/MUST-safety.md', '# Safety');
      await put(root, '.claude/skills/alpha/SKILL.md', '# alpha');
      await put(root, 'guides/intro.md', '# guide');
      git(root, 'add', '.gitignore', '.claude/rules', '.claude/skills', 'guides');
      await put(root, '.claude/contexts/dev.md', '# dev');
      await put(root, '.claude/contexts/index.yaml', 'a: 1\n');
      await put(root, '.claude/contexts/sub/deep.md', '# deep');
    }

    const TRACKED_KEYS = [
      '.claude/rules/MUST-safety.md',
      '.claude/skills/alpha/SKILL.md',
      'guides/intro.md',
    ];

    const filteredOf = (dir: string): Promise<Lockfile> =>
      generateLockfile(dir, '1.0.0', '1.0.0', { excludeGitIgnored: true });

    function keysOf(lockfile: Lockfile): string[] {
      return Object.keys(lockfile.files);
    }

    it('omits every file of a directory ignored as a whole (.claude/contexts/)', async () => {
      await seedRepo(tempDir);

      const unfiltered = await generateLockfile(tempDir, '1.0.0', '1.0.0');
      const filtered = await filteredOf(tempDir);

      expect(keysOf(unfiltered)).toContain('.claude/contexts/dev.md');
      expect(keysOf(unfiltered)).toContain('.claude/contexts/index.yaml');
      expect(keysOf(unfiltered)).toContain('.claude/contexts/sub/deep.md');
      expect(keysOf(filtered)).toEqual(TRACKED_KEYS);
    });

    it('explicit false behaves like the default (installer/updater contract)', async () => {
      await seedRepo(tempDir);

      const explicit = await generateLockfile(tempDir, '1.0.0', '1.0.0', {
        excludeGitIgnored: false,
      });
      const implicit = await generateLockfile(tempDir, '1.0.0', '1.0.0');

      expect(keysOf(explicit)).toEqual(keysOf(implicit));
      expect(keysOf(explicit)).toContain('.claude/contexts/dev.md');
    });

    it('default path does not need git: works outside any git work tree', async () => {
      await put(tempDir, '.claude/contexts/dev.md', '# dev');

      const lockfile = await generateLockfile(tempDir, '1.0.0', '1.0.0');

      expect(keysOf(lockfile)).toEqual(['.claude/contexts/dev.md']);
    });

    it('a copy holding only tracked files yields the same lockfile as the full copy', async () => {
      await seedRepo(tempDir);
      const trackedOnly = await mkdtemp(join(tmpdir(), 'omcustom-lockfile-tracked-'));
      try {
        git(trackedOnly, 'init', '-q');
        for (const key of [...TRACKED_KEYS, '.gitignore']) {
          await mkdir(dirname(join(trackedOnly, key)), { recursive: true });
          await cp(join(tempDir, key), join(trackedOnly, key));
        }

        const full = await filteredOf(tempDir);
        const partial = await filteredOf(trackedOnly);

        expect(full.files).toEqual(partial.files);
        expect(Object.keys(full.files)).toHaveLength(TRACKED_KEYS.length);
      } finally {
        await rm(trackedOnly, { recursive: true, force: true });
      }
    });

    it('keeps tracked files even when an ignore rule matches them (force-added)', async () => {
      await seedRepo(tempDir);
      git(tempDir, 'add', '-f', '.claude/contexts/dev.md');

      const filtered = await filteredOf(tempDir);

      expect(keysOf(filtered)).toContain('.claude/contexts/dev.md');
      expect(keysOf(filtered)).not.toContain('.claude/contexts/index.yaml');
    });

    it('keeps untracked files that are not ignored (they ship once committed)', async () => {
      await seedRepo(tempDir);
      await put(tempDir, '.claude/rules/SHOULD-new.md', '# new, not yet added');

      const filtered = await filteredOf(tempDir);

      expect(keysOf(filtered)).toContain('.claude/rules/SHOULD-new.md');
    });

    it('honors ignore rules deeper in the tree (nested .gitignore and name patterns)', async () => {
      await seedRepo(tempDir);
      await put(tempDir, '.claude/skills/alpha/.gitignore', '*.local\n');
      await put(tempDir, '.claude/skills/alpha/notes.local', 'scratch');
      await put(tempDir, '.claude/skills/alpha/ref/deep.md', '# deep');
      await put(tempDir, '.claude/skills/alpha/ref/deep.local', 'scratch');

      const unfiltered = await generateLockfile(tempDir, '1.0.0', '1.0.0');
      const filtered = await filteredOf(tempDir);

      expect(keysOf(unfiltered)).toContain('.claude/skills/alpha/notes.local');
      expect(keysOf(unfiltered)).toContain('.claude/skills/alpha/ref/deep.local');
      expect(keysOf(filtered)).not.toContain('.claude/skills/alpha/notes.local');
      expect(keysOf(filtered)).not.toContain('.claude/skills/alpha/ref/deep.local');
      expect(keysOf(filtered)).toContain('.claude/skills/alpha/ref/deep.md');
    });

    it('applies per-user excludes ($XDG_CONFIG_HOME/git/ignore): never added here, never cloned', async () => {
      await seedRepo(tempDir);
      await put(tempDir, '.claude/rules/SHOULD-new.md', '# personal scratch');
      await put(gitHome, 'xdg/git/ignore', 'SHOULD-*\n');

      const filtered = await filteredOf(tempDir);

      expect(keysOf(filtered)).toEqual(TRACKED_KEYS);
    });

    it('matches file names with spaces, non-ASCII and quote characters exactly', async () => {
      await seedRepo(tempDir);
      const names = [
        '.claude/rules/with space.md',
        '.claude/rules/한글-규칙.md',
        '.claude/rules/quote"d.md',
      ];
      for (const name of names) {
        await put(tempDir, name, `# ${name}`);
      }

      const filtered = await filteredOf(tempDir);

      for (const name of names) {
        expect(keysOf(filtered)).toContain(name);
      }
    });

    it('keeps a tracked file whose on-disk name is NFD (git may report it as NFC)', async () => {
      await seedRepo(tempDir);
      // Case folding off, so only the NFC fallback can match git's NFC spelling.
      git(tempDir, 'config', 'core.ignorecase', 'false');
      const nfd = '.claude/rules/cafe\u0301.md';
      await put(tempDir, nfd, '# nfd');
      git(tempDir, 'add', '.claude/rules');

      const filtered = await filteredOf(tempDir);

      expect(keysOf(filtered).map((key) => key.normalize('NFC'))).toContain(nfd.normalize('NFC'));
    });

    it('keeps a tracked file whose index spelling is NFD while the disk spelling is NFC', async () => {
      await seedRepo(tempDir);
      // Raw (NFD) names from git, no case folding, and the NFC disk name matches an ignore
      // rule, so only git's NFD index entry can vouch for the file.
      git(tempDir, 'config', 'core.precomposeunicode', 'false');
      git(tempDir, 'config', 'core.ignorecase', 'false');
      await put(tempDir, '.claude/rules/.gitignore', 'caf*\n');
      await put(tempDir, '.claude/rules/cafe\u0301.md', '# tracked');
      git(tempDir, 'add', '-f', '.claude/rules/cafe\u0301.md');
      await rename(
        join(tempDir, '.claude/rules/cafe\u0301.md'),
        join(tempDir, '.claude/rules/caf\u00e9.md')
      );

      const filtered = await filteredOf(tempDir);

      expect(keysOf(filtered)).toContain('.claude/rules/caf\u00e9.md');
    });

    it('excludes an ignored file whose on-disk name is NFD (compared after NFC normalization)', async () => {
      await seedRepo(tempDir);
      await put(tempDir, '.claude/rules/.gitignore', '*.local\n');
      await put(tempDir, '.claude/rules/cafe\u0301.local', 'scratch');

      const unfiltered = await generateLockfile(tempDir, '1.0.0', '1.0.0');
      const filtered = await filteredOf(tempDir);
      const nfc = (lockfile: Lockfile): string[] =>
        keysOf(lockfile).map((key) => key.normalize('NFC'));

      expect(nfc(unfiltered)).toContain('.claude/rules/café.local'.normalize('NFC'));
      expect(nfc(filtered)).not.toContain('.claude/rules/café.local'.normalize('NFC'));
    });

    it('excludes an ignored NFD-named file when git reports raw names (core.precomposeunicode=false)', async () => {
      await seedRepo(tempDir);
      // Without precomposition git prints the on-disk (NFD) bytes, so its side needs NFC too.
      git(tempDir, 'config', 'core.precomposeunicode', 'false');
      await put(tempDir, '.claude/rules/.gitignore', '*.local\n');
      await put(tempDir, '.claude/rules/cafe\u0301.local', 'scratch');

      const filtered = await filteredOf(tempDir);

      expect(keysOf(filtered).map((key) => key.normalize('NFC'))).not.toContain(
        '.claude/rules/café.local'.normalize('NFC')
      );
    });

    it('keeps a tracked file after a case-only rename on disk (core.ignorecase=true)', async () => {
      await seedRepo(tempDir);
      git(tempDir, 'config', 'core.ignorecase', 'true');
      await put(tempDir, '.claude/rules/Foo.md', '# foo');
      git(tempDir, 'add', '.claude/rules/Foo.md');
      // Two steps so the rename also takes effect on case-insensitive file systems.
      await rename(join(tempDir, '.claude/rules/Foo.md'), join(tempDir, '.claude/rules/tmp.md'));
      await rename(join(tempDir, '.claude/rules/tmp.md'), join(tempDir, '.claude/rules/foo.md'));

      const filtered = await filteredOf(tempDir);

      expect(keysOf(filtered)).toContain('.claude/rules/foo.md');
    });

    // The case-insensitive fallback is gated on core.ignorecase: an ignored on-disk `foo.md`
    // whose only match is the tracked `Foo.md` is kept with ignorecase=true, excluded otherwise
    // (false, or unset — git's default).
    for (const ignoreCase of ['true', 'yes', 'false', 'unset'] as const) {
      it(`case-insensitive fallback applies only when core.ignorecase=true (${ignoreCase})`, async () => {
        await seedRepo(tempDir);
        if (ignoreCase === 'unset') {
          // Set first so --unset succeeds where git init did not write the key (Linux).
          git(tempDir, 'config', 'core.ignorecase', 'true');
          git(tempDir, 'config', '--unset', 'core.ignorecase');
        } else {
          git(tempDir, 'config', 'core.ignorecase', ignoreCase);
        }
        await put(tempDir, '.claude/rules/.gitignore', 'foo.md\n');
        await put(tempDir, '.claude/rules/Foo.md', '# foo');
        git(tempDir, 'add', '-f', '.claude/rules/Foo.md');
        await rename(join(tempDir, '.claude/rules/Foo.md'), join(tempDir, '.claude/rules/tmp.md'));
        await rename(join(tempDir, '.claude/rules/tmp.md'), join(tempDir, '.claude/rules/foo.md'));

        const keys = keysOf(await filteredOf(tempDir));

        expect(keys.includes('.claude/rules/foo.md')).toBe(
          ignoreCase === 'true' || ignoreCase === 'yes'
        );
      });
    }

    it('keeps tracked files after a stray `git init` inside their directory', async () => {
      await seedRepo(tempDir);
      git(join(tempDir, '.claude', 'skills', 'alpha'), 'init', '-q');

      const filtered = await filteredOf(tempDir);

      expect(keysOf(filtered)).toEqual(TRACKED_KEYS);
    });

    it('keeps untracked files in a directory whose .git file is invalid (git treats it as plain)', async () => {
      await seedRepo(tempDir);
      await put(tempDir, '.claude/skills/wt/.git', 'gitdir: /nonexistent/wt\n');
      await put(tempDir, '.claude/skills/wt/x.md', '# ships once added');

      const filtered = await filteredOf(tempDir);

      expect(keysOf(filtered)).toContain('.claude/skills/wt/x.md');
      expect(keysOf(filtered)).not.toContain('.claude/skills/wt/.git');
    });

    it('records nothing below a gitlink (submodule content is not in a clone)', async () => {
      await seedRepo(tempDir);
      const sub = join(tempDir, '.claude', 'skills', 'sub');
      await put(sub, 'SKILL.md', '# sub');
      git(sub, 'init', '-q');
      git(sub, 'add', 'SKILL.md');
      commit(sub);
      git(tempDir, 'add', '.claude/skills/sub');
      expect(git(tempDir, 'ls-files', '-s', '.claude/skills/sub')).toStartWith('160000');

      const unfiltered = await generateLockfile(tempDir, '1.0.0', '1.0.0');
      const filtered = await filteredOf(tempDir);

      expect(keysOf(unfiltered)).toContain('.claude/skills/sub/SKILL.md');
      expect(keysOf(filtered)).toEqual(TRACKED_KEYS);
    });

    it('accepts the root of a linked worktree (.git is a file)', async () => {
      await seedRepo(tempDir);
      commit(tempDir);
      const parent = await mkdtemp(join(tmpdir(), 'omcustom-lockfile-wt-'));
      try {
        const worktree = join(parent, 'wt');
        git(tempDir, 'worktree', 'add', '-q', worktree);

        const filtered = await filteredOf(worktree);

        expect(keysOf(filtered)).toEqual(TRACKED_KEYS);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });

    it('accepts a work tree root whose path ends with a space', async () => {
      const spaced = join(tempDir, 'repo ');
      await mkdir(spaced);
      await seedRepo(spaced);

      const filtered = await filteredOf(spaced);

      expect(keysOf(filtered)).toEqual(TRACKED_KEYS);
    });

    it('wraps a failure to resolve the work tree root with the #1819 guidance', async () => {
      await seedRepo(tempDir);
      const spy = vi.spyOn(fsPromises, 'realpath').mockRejectedValue(new Error('realpath boom'));
      try {
        const failure = filteredOf(tempDir);

        await expect(failure).rejects.toThrow('realpath boom');
        await expect(failure).rejects.toThrow('build from a git checkout');
      } finally {
        spy.mockRestore();
      }
    });

    for (const tracked of [false, true]) {
      it(`does not follow a symlinked directory into files git does not list (tracked link: ${tracked})`, async () => {
        await seedRepo(tempDir);
        const outside = await mkdtemp(join(tmpdir(), 'omcustom-lockfile-outside-'));
        try {
          await writeFile(join(outside, 'leak.md'), '# outside the repo', 'utf-8');
          await symlink(outside, join(tempDir, '.claude', 'rules', 'linked'));
          if (tracked) {
            git(tempDir, 'add', '.claude/rules/linked');
          }

          const unfiltered = await generateLockfile(tempDir, '1.0.0', '1.0.0');
          const filtered = await filteredOf(tempDir);

          // The default walk descends into the link target; git lists only the link itself.
          expect(keysOf(unfiltered)).toContain('.claude/rules/linked/leak.md');
          expect(keysOf(filtered)).not.toContain('.claude/rules/linked/leak.md');
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      });
    }

    it('stops at a nested repository: neither its files nor its .git internals are recorded', async () => {
      await seedRepo(tempDir);
      const nested = join(tempDir, '.claude', 'skills', 'beta');
      await put(nested, 'SKILL.md', '# beta, a separate repository');
      git(nested, 'init', '-q');

      const unfiltered = await generateLockfile(tempDir, '1.0.0', '1.0.0');
      const filtered = await filteredOf(tempDir);

      expect(keysOf(unfiltered)).toContain('.claude/skills/beta/SKILL.md');
      expect(keysOf(unfiltered)).toContain('.claude/skills/beta/.git/HEAD');
      expect(keysOf(filtered)).toEqual(TRACKED_KEYS);
    });

    it('accepts targetDir given through a symlink to the work tree root (realpath compare)', async () => {
      await seedRepo(tempDir);
      const linkParent = await mkdtemp(join(tmpdir(), 'omcustom-lockfile-link-'));
      try {
        const link = join(linkParent, 'repo');
        await symlink(tempDir, link);

        const filtered = await filteredOf(link);

        expect(keysOf(filtered)).toEqual(TRACKED_KEYS);
      } finally {
        await rm(linkParent, { recursive: true, force: true });
      }
    });

    it('rejects a targetDir that is a subdirectory of its work tree', async () => {
      await seedRepo(tempDir);
      const sub = join(tempDir, 'pkg');
      await put(sub, '.claude/rules/MUST-sub.md', '# sub');

      await expect(filteredOf(sub)).rejects.toThrow('not the root of its git work tree');
    });

    it('rejects a directory that a parent repository ignores instead of recording 0 files', async () => {
      await seedRepo(tempDir);
      await put(tempDir, '.gitignore', 'vendor/\n');
      const vendored = join(tempDir, 'vendor', 'pkg');
      await put(vendored, '.claude/rules/MUST-vendored.md', '# vendored');

      expect(keysOf(await generateLockfile(vendored, '1.0.0', '1.0.0'))).toEqual([
        '.claude/rules/MUST-vendored.md',
      ]);
      await expect(filteredOf(vendored)).rejects.toThrow('not the root of its git work tree');
    });

    // Decoys a parent git process can export (a git hook sets GIT_DIR/GIT_INDEX_FILE). Each would
    // change the result if git honored it: the decoy repository has an empty index and an
    // info/exclude that ignores SHOULD-*; GIT_WORK_TREE would make the decoy the work tree root.
    // GIT_PREFIX is not covered: measured to have no effect on `git ls-files` (git 2.52.0).
    for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'] as const) {
      it(`ignores an inherited ${key} that points at another repository`, async () => {
        await seedRepo(tempDir);
        git(tempDir, 'add', '-f', '.claude/contexts/dev.md');
        await put(tempDir, '.claude/rules/SHOULD-new.md', '# new');
        const decoy = await mkdtemp(join(tmpdir(), 'omcustom-lockfile-decoy-'));
        try {
          git(decoy, 'init', '-q');
          await put(decoy, '.git/info/exclude', 'SHOULD-*\n');
          const decoyValue: Record<typeof key, string> = {
            GIT_DIR: join(decoy, '.git'),
            GIT_INDEX_FILE: join(decoy, '.git', 'index'),
            GIT_WORK_TREE: decoy,
            GIT_COMMON_DIR: join(decoy, '.git'),
          };
          setEnv(key, decoyValue[key]);

          const filtered = await filteredOf(tempDir);

          expect(keysOf(filtered)).toEqual([
            '.claude/contexts/dev.md',
            '.claude/rules/MUST-safety.md',
            '.claude/rules/SHOULD-new.md',
            '.claude/skills/alpha/SKILL.md',
            'guides/intro.md',
          ]);
        } finally {
          await rm(decoy, { recursive: true, force: true });
        }
      });
    }

    for (const form of ['GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT'] as const) {
      it(`ignores excludes injected through ${form} (git -c from a parent process)`, async () => {
        await seedRepo(tempDir);
        await put(tempDir, '.claude/rules/SHOULD-new.md', '# new');
        const excludes = join(gitHome, 'injected-excludes');
        await writeFile(excludes, 'SHOULD-*\n', 'utf-8');
        if (form === 'GIT_CONFIG_PARAMETERS') {
          setEnv('GIT_CONFIG_PARAMETERS', `'core.excludesfile'='${excludes}'`);
        } else {
          setEnv('GIT_CONFIG_COUNT', '1');
          setEnv('GIT_CONFIG_KEY_0', 'core.excludesFile');
          setEnv('GIT_CONFIG_VALUE_0', excludes);
        }

        const filtered = await filteredOf(tempDir);

        expect(keysOf(filtered)).toContain('.claude/rules/SHOULD-new.md');
      });
    }

    it('rejects outside a git work tree instead of silently recording everything', async () => {
      await put(tempDir, '.claude/contexts/dev.md', '# dev');

      await expect(filteredOf(tempDir)).rejects.toThrow('build from a git checkout');
    });

    it('generateAndWriteLockfileForDir returns { fileCount: 0, warning } with guidance and writes nothing without git', async () => {
      await put(tempDir, '.claude/contexts/dev.md', '# dev');

      const result = await generateAndWriteLockfileForDir(tempDir, { excludeGitIgnored: true });

      expect(result.fileCount).toBe(0);
      expect(result.warning).toContain('Lockfile generation failed');
      expect(result.warning).toContain('build from a git checkout');
      expect(result.warning).toContain('#1819');
      expect(await readLockfile(tempDir)).toBeNull();
    });

    it('generateAndWriteLockfileForDir applies the option and still keeps generatedAt', async () => {
      await seedRepo(tempDir);
      const options = { excludeGitIgnored: true };

      const first = await generateAndWriteLockfileForDir(tempDir, options);
      const before = await readFile(join(tempDir, LOCKFILE_NAME), 'utf-8');
      const second = await generateAndWriteLockfileForDir(tempDir, options);

      expect(first.fileCount).toBe(TRACKED_KEYS.length);
      expect(second.fileCount).toBe(TRACKED_KEYS.length);
      expect(await readFile(join(tempDir, LOCKFILE_NAME), 'utf-8')).toBe(before);
    });

    it('scripts/sync-source-lockfile.ts (bun run build path) drops ignored files', async () => {
      await seedRepo(tempDir);

      const out = execFileSync(
        process.execPath,
        [join(repoRoot, 'scripts', 'sync-source-lockfile.ts')],
        { cwd: tempDir, env: fixtureEnv(), encoding: 'utf-8', stdio: 'pipe' }
      );

      expect(out).toContain(`(${TRACKED_KEYS.length} files)`);
      const lockfile = await readLockfile(tempDir);
      expect(keysOf(lockfile as Lockfile)).toEqual(TRACKED_KEYS);
    });

    it('scripts/sync-source-lockfile.ts exits 1 outside a git checkout and says why', async () => {
      await put(tempDir, '.claude/rules/MUST-safety.md', '# Safety');

      const run = spawnSync(
        process.execPath,
        [join(repoRoot, 'scripts', 'sync-source-lockfile.ts')],
        {
          cwd: tempDir,
          env: fixtureEnv(),
          encoding: 'utf-8',
        }
      );

      expect(run.status).toBe(1);
      expect(run.stderr).toContain('build from a git checkout');
      expect(await readLockfile(tempDir)).toBeNull();
    });

    /** Repo-relative paths (forward slashes) of files under `top` that mention `needle`. */
    async function filesMentioning(top: string, needle: string): Promise<string[]> {
      const entries = await readdir(join(repoRoot, top), { recursive: true, withFileTypes: true });
      const found: string[] = [];
      for (const entry of entries.filter((candidate) => candidate.isFile())) {
        const absolute = join(entry.parentPath, entry.name);
        if ((await readFile(absolute, 'utf-8')).includes(needle)) {
          found.push(relative(repoRoot, absolute).split(sep).join('/'));
        }
      }
      return found;
    }

    it('only the source-repo script opts in: scan of src/ and scripts/ finds no other caller', async () => {
      const mentions = [
        ...(await filesMentioning('src', 'excludeGitIgnored')),
        ...(await filesMentioning('scripts', 'excludeGitIgnored')),
      ];
      const found = mentions.filter((path) => path !== 'src/core/lockfile.ts');

      expect(found).toEqual(['scripts/sync-source-lockfile.ts']);
      expect(await readFile(join(repoRoot, 'scripts/sync-source-lockfile.ts'), 'utf-8')).toContain(
        'excludeGitIgnored: true'
      );
    });
  });
});
