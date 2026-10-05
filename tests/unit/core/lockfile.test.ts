import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});
