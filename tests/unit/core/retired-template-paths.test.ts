/**
 * templates/retired-template-paths.json and its loader (#1935).
 *
 * The freshness test regenerates the file from git history and needs full history: it runs when
 * `git rev-parse --is-shallow-repository` prints `false` (local checkouts, pre-commit) and is
 * skipped otherwise (CI's shallow `test` job, no git). The generator script is imported only
 * inside that test, so a skipped run does not load it.
 */

import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isRetirablePath,
  loadRetiredTemplatePaths,
  parseRetiredTemplatePaths,
  RETIRED_TEMPLATE_PATHS_DESCRIPTION,
  RETIRED_TEMPLATE_PATHS_FILE,
  RETIRED_TEMPLATE_PATHS_SCHEMA_VERSION,
} from '../../../src/core/retired-template-paths.js';

const repoRoot = join(import.meta.dir, '..', '..', '..');
const committedPath = join(repoRoot, 'templates', RETIRED_TEMPLATE_PATHS_FILE);

function gitEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

/** True only when this checkout has full history; shallow clones and missing git skip. */
const hasFullHistory = (() => {
  const result = spawnSync('git', ['rev-parse', '--is-shallow-repository'], {
    cwd: repoRoot,
    env: gitEnv(),
    encoding: 'utf-8',
  });
  return result.status === 0 && result.stdout.trim() === 'false';
})();

const isCodeUnitSorted = (values: readonly string[]): boolean =>
  values.every((value, index) => index === 0 || values[index - 1] < value);

async function readCommitted() {
  return parseRetiredTemplatePaths(JSON.parse(await readFile(committedPath, 'utf-8')));
}

describe('templates/retired-template-paths.json', () => {
  it('(a) has a valid schema, canonical component paths and sorted unique hashes', async () => {
    const file = await readCommitted();

    expect(file.schemaVersion).toBe(RETIRED_TEMPLATE_PATHS_SCHEMA_VERSION);
    expect(file.description).toBe(RETIRED_TEMPLATE_PATHS_DESCRIPTION);
    expect(file.paths.length).toBeGreaterThan(0);
    expect(isCodeUnitSorted(file.paths.map((entry) => entry.path))).toBe(true);
    for (const entry of file.paths) {
      expect(isRetirablePath(entry.path)).toBe(true);
      expect(isCodeUnitSorted(entry.sha256)).toBe(true);
    }
    const raw = await readFile(committedPath, 'utf-8');
    expect(raw).toBe(`${JSON.stringify(file, null, 2)}\n`);
  });

  it('(b) lists no path that the current templates still ship', async () => {
    for (const { path } of (await readCommitted()).paths) {
      await expect(lstat(join(repoRoot, 'templates', path))).rejects.toThrow();
    }
  });

  it('(c) contains the #1935 regression set and the RTK paths', async () => {
    const paths = new Set((await readCommitted()).paths.map((entry) => entry.path));
    for (const skill of [
      'codex-exec',
      'gemini-exec',
      'jinja2-prompts',
      'memory-management',
      'memory-recall',
      'memory-save',
      'peer-messaging',
      'sdd-development',
      'writing-clearly-and-concisely',
    ]) {
      expect(paths.has(`.claude/skills/${skill}/SKILL.md`)).toBe(true);
    }
    for (const guide of ['agentmemory-migration', 'profiles']) {
      expect([...paths].some((path) => path.startsWith(`guides/${guide}/`))).toBe(true);
    }
    for (const rtk of [
      '.claude/skills/rtk-exec/SKILL.md',
      '.claude/skills/rtk-exec/scripts/rtk-wrapper.cjs',
      '.claude/hooks/scripts/rtk-intercept.sh',
    ]) {
      expect(paths.has(rtk)).toBe(true);
    }
  });

  it.skipIf(!hasFullHistory)(
    '(d) equals the generator output for this checkout (full history only)',
    async () => {
      const { generateRetiredTemplatePaths, serializeRetiredTemplatePaths } = await import(
        '../../../scripts/generate-retired-template-paths.js'
      );
      const expected = serializeRetiredTemplatePaths(generateRetiredTemplatePaths(repoRoot));
      expect(await readFile(committedPath, 'utf-8')).toBe(expected);
    },
    30_000
  );
});

describe('loadRetiredTemplatePaths', () => {
  it('loads the shipped file by default', async () => {
    expect(await loadRetiredTemplatePaths()).toEqual((await readCommitted()).paths);
  });

  it('returns an empty list when the file does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'omcustom-retired-'));
    try {
      expect(await loadRetiredTemplatePaths(join(dir, 'missing.json'))).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects unreadable or malformed files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'omcustom-retired-'));
    try {
      await mkdir(join(dir, 'is-a-directory.json'));
      await expect(loadRetiredTemplatePaths(join(dir, 'is-a-directory.json'))).rejects.toThrow();
      await writeFile(join(dir, 'bad.json'), '{ not json');
      await expect(loadRetiredTemplatePaths(join(dir, 'bad.json'))).rejects.toThrow();
      await writeFile(join(dir, 'wrong.json'), JSON.stringify({ schemaVersion: 2 }));
      await expect(loadRetiredTemplatePaths(join(dir, 'wrong.json'))).rejects.toThrow(
        'unsupported retired template paths schemaVersion: 2'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('parseRetiredTemplatePaths', () => {
  const valid = (paths: unknown) => ({ description: 'd', schemaVersion: 1, paths });
  const hash = 'a'.repeat(64);

  it('accepts a minimal valid file and copies the hash arrays', () => {
    const sha256 = [hash];
    const parsed = parseRetiredTemplatePaths(valid([{ path: 'guides/x/y.md', sha256 }]));
    expect(parsed).toEqual({
      description: 'd',
      schemaVersion: 1,
      paths: [{ path: 'guides/x/y.md', sha256: [hash] }],
    });
    expect(parsed.paths[0].sha256).not.toBe(sha256);
  });

  it.each([
    ['null', null, 'must be a JSON object'],
    ['an array', [], 'must be a JSON object'],
    ['a missing description', { schemaVersion: 1, paths: [] }, 'description must be a string'],
    ['non-array paths', { description: 'd', schemaVersion: 1, paths: {} }, 'must be an array'],
  ])('rejects %s', (_label, data, message) => {
    expect(() => parseRetiredTemplatePaths(data)).toThrow(message);
  });

  it.each([
    ['a non-object entry', ['x'], 'paths[0] must be an object'],
    ['an array entry', [[]], 'paths[0] must be an object'],
    ['an absolute path', [{ path: '/etc/passwd', sha256: [] }], 'paths[0].path'],
    ['a parent segment', [{ path: '.claude/skills/../x.md', sha256: [] }], 'paths[0].path'],
    ['a glob', [{ path: '.claude/skills/*.md', sha256: [] }], 'paths[0].path'],
    ['a non-component path', [{ path: 'CLAUDE.md', sha256: [] }], 'paths[0].path'],
    ['a non-string path', [{ path: 7, sha256: [] }], 'paths[0].path'],
    ['non-array hashes', [{ path: 'guides/a.md', sha256: hash }], 'paths[0].sha256'],
    ['an uppercase hash', [{ path: 'guides/a.md', sha256: ['A'.repeat(64)] }], 'paths[0].sha256'],
    ['a short hash', [{ path: 'guides/a.md', sha256: ['a'] }], 'paths[0].sha256'],
    [
      'a duplicate path',
      [
        { path: 'guides/a.md', sha256: [] },
        { path: 'guides/a.md', sha256: [] },
      ],
      'listed twice: guides/a.md',
    ],
  ])('rejects %s', (_label, paths, message) => {
    expect(() => parseRetiredTemplatePaths(valid(paths))).toThrow(message);
  });
});
