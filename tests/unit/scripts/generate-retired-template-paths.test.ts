/**
 * scripts/generate-retired-template-paths.ts against throwaway git repositories (#1935).
 * These fixtures carry their own full history, so they run in shallow CI checkouts too.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  generateRetiredTemplatePaths,
  main,
  parseCatFileBatch,
  parseRawLog,
  serializeRetiredTemplatePaths,
} from '../../../scripts/generate-retired-template-paths.js';
import { RETIRED_TEMPLATE_PATHS_DESCRIPTION } from '../../../src/core/retired-template-paths.js';

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

function fixtureEnv(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  return {
    ...env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd: root,
    env: fixtureEnv(),
    stdio: 'pipe',
  });
}

let scratch: string;
let repo: string;

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(repo, path)), { recursive: true });
  await writeFile(join(repo, path), content);
}

/**
 * History: add → modify → delete/rename/retire → re-add one guide; plus an unstaged
 * working-tree deletion (the pre-commit case where the deleting commit is not made yet).
 */
async function seedHistory(): Promise<void> {
  git(repo, 'init', '-q');
  await put('templates/.claude/skills/a/SKILL.md', 'a v1\n');
  await put('templates/.claude/skills/b/SKILL.md', 'b\n');
  await put('templates/.claude/rules/keep.md', 'keep\n');
  await put('templates/guides/g/x.md', 'x v1\n');
  await put('templates/CLAUDE.md', 'entry doc\n');
  await put('templates/agents/old/z.md', 'old layout\n');
  await put('src/not-templates.md', 'outside templates\n');
  await mkdir(join(repo, 'templates/.claude/skills/s'), { recursive: true });
  await symlink('../a/SKILL.md', join(repo, 'templates/.claude/skills/s/link.md'));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'add');

  await put('templates/.claude/skills/a/SKILL.md', 'a v2\n');
  git(repo, 'commit', '-q', '-am', 'modify');

  git(repo, 'rm', '-q', 'templates/.claude/skills/a/SKILL.md', 'templates/guides/g/x.md');
  git(repo, 'rm', '-q', 'templates/CLAUDE.md', 'templates/agents/old/z.md', 'src/not-templates.md');
  git(repo, 'rm', '-q', 'templates/.claude/skills/s/link.md');
  await mkdir(join(repo, 'templates/.claude/skills/b2'), { recursive: true });
  git(repo, 'mv', 'templates/.claude/skills/b/SKILL.md', 'templates/.claude/skills/b2/SKILL.md');
  git(repo, 'commit', '-q', '-m', 'retire and rename');

  await put('templates/guides/g/x.md', 'x v2\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 're-add guide');

  await unlink(join(repo, 'templates/.claude/rules/keep.md'));
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'omcustom-retired-gen-'));
  repo = join(scratch, 'repo');
  await mkdir(repo);
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('generateRetiredTemplatePaths', () => {
  it('lists deleted, renamed-away and working-tree-deleted component paths with every shipped hash', async () => {
    await seedHistory();

    const file = generateRetiredTemplatePaths(repo);

    expect(file.description).toBe(RETIRED_TEMPLATE_PATHS_DESCRIPTION);
    expect(file.schemaVersion).toBe(1);
    expect(file.paths).toEqual([
      { path: '.claude/rules/keep.md', sha256: [sha256('keep\n')] },
      { path: '.claude/skills/a/SKILL.md', sha256: [sha256('a v1\n'), sha256('a v2\n')].sort() },
      // `--no-renames`: the old side of a rename is a deletion.
      { path: '.claude/skills/b/SKILL.md', sha256: [sha256('b\n')] },
      // A path that was only ever a symlink has no regular-file version to match.
      { path: '.claude/skills/s/link.md', sha256: [] },
    ]);
  });

  it('keeps versions from a side branch whose changes a merge discarded (--full-history)', async () => {
    git(repo, 'init', '-q', '-b', 'main');
    await put('templates/.claude/skills/x/SKILL.md', 'x v1\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'add');
    git(repo, 'checkout', '-q', '-b', 'side');
    await put('templates/.claude/skills/x/SKILL.md', 'x side\n');
    git(repo, 'commit', '-q', '-am', 'side change, shipped from the side branch');
    git(repo, 'checkout', '-q', 'main');
    // The merge keeps main's tree, so it is TREESAME to its first parent: default history
    // simplification prunes the side branch and its blob. (With git 2.52 `-m` already prevents
    // that, so this pins the behaviour the generator requires rather than the flag itself.)
    git(repo, 'merge', '-q', '-s', 'ours', '--no-edit', 'side');
    git(repo, 'rm', '-q', 'templates/.claude/skills/x/SKILL.md');
    git(repo, 'commit', '-q', '-m', 'retire');

    expect(generateRetiredTemplatePaths(repo).paths).toEqual([
      { path: '.claude/skills/x/SKILL.md', sha256: [sha256('x side\n'), sha256('x v1\n')].sort() },
    ]);
  });

  it('returns an empty list when nothing was retired', async () => {
    git(repo, 'init', '-q');
    await put('templates/.claude/skills/a/SKILL.md', 'a\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'add');

    expect(generateRetiredTemplatePaths(repo).paths).toEqual([]);
  });

  it('refuses a shallow clone', async () => {
    await seedHistory();
    const shallow = join(scratch, 'shallow');
    git(scratch, 'clone', '-q', '--depth', '1', `file://${repo}`, shallow);

    expect(() => generateRetiredTemplatePaths(shallow)).toThrow('shallow clone');
  });

  it('fails outside a git repository', async () => {
    expect(() => generateRetiredTemplatePaths(repo)).toThrow('git rev-parse failed');
  });
});

describe('main', () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('writes the file, then --check passes until it goes stale or missing', async () => {
    await seedHistory();
    const target = join(repo, 'templates', 'retired-template-paths.json');

    expect(main([], repo)).toBe(0);
    expect(await readFile(target, 'utf-8')).toBe(
      serializeRetiredTemplatePaths(generateRetiredTemplatePaths(repo))
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('(4 paths)'));

    expect(main(['--check'], repo)).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('up to date (4 paths)'));

    await writeFile(target, '{}\n');
    expect(main(['--check'], repo)).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('is stale'));

    await unlink(target);
    expect(main(['--check'], repo)).toBe(1);
  });

  it('reports generation errors with exit code 1', () => {
    expect(main([], repo)).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('git rev-parse failed'));
  });
});

describe('parsers', () => {
  it('parseRawLog skips a header without a path and non-component paths', () => {
    const blob = 'b'.repeat(40);
    const zero = '0'.repeat(40);
    const output = [
      `:000000 100644 ${zero} ${blob} A`,
      'templates/README.md',
      `\n:000000 100644 ${zero} ${blob} A`,
      'templates/guides/a.md',
      `:000000 160000 ${zero} ${blob} A`,
      'templates/guides/submodule',
      `:000000 100644 ${zero} ${blob} A`,
    ].join('\0');

    expect(parseRawLog(output)).toEqual(
      new Map([
        ['guides/a.md', new Set([blob])],
        ['guides/submodule', new Set()],
      ])
    );
  });

  it('parseCatFileBatch hashes blob contents', () => {
    const output = Buffer.from('abc blob 3\nxyz\ndef blob 0\n\n');
    expect(parseCatFileBatch(output, ['abc', 'def'])).toEqual(
      new Map([
        ['abc', sha256('xyz')],
        ['def', sha256('')],
      ])
    );
  });

  it.each([
    ['a missing object', 'abc missing\n', ['abc'], 'unexpected git cat-file output'],
    ['a header without newline', 'abc blob 3', ['abc'], 'truncated'],
    ['truncated content', 'abc blob 10\nxyz\n', ['abc'], 'truncated'],
    ['an absent expected id', 'abc blob 1\nx\n', ['abc', 'def'], 'did not return blob(s): def'],
  ])('parseCatFileBatch rejects %s', (_label, raw, ids, message) => {
    expect(() => parseCatFileBatch(Buffer.from(raw), ids)).toThrow(message);
  });
});
