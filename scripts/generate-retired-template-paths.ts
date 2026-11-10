/**
 * Regenerate templates/retired-template-paths.json from git history (#1935).
 *
 *   bun run scripts/generate-retired-template-paths.ts           # write the file
 *   bun run scripts/generate-retired-template-paths.ts --check   # exit 1 when it is stale
 *
 * A path is retired when some commit reachable from HEAD added, modified or deleted
 * `templates/<path>`, `<path>` lies inside a lockfile component, and `templates/<path>` does not
 * exist in the working tree. History is read with `--no-renames`, so a renamed file's old path is
 * a deletion and is listed; `-m` also reads merge commits against each parent. For every path,
 * the SHA-256 of each regular-file blob it ever had (both sides of every change) is recorded.
 *
 * Requires a git checkout with full history: a shallow clone would silently drop paths retired
 * before its cut-off, so generation refuses to run there.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isRetirablePath,
  RETIRED_TEMPLATE_PATHS_DESCRIPTION,
  RETIRED_TEMPLATE_PATHS_FILE,
  RETIRED_TEMPLATE_PATHS_SCHEMA_VERSION,
  type RetiredTemplatePathsFile,
} from '../src/core/retired-template-paths.js';

const TEMPLATES_PREFIX = 'templates/';

/** Environment for git children: drop every `GIT_*` variable so git resolves `repoRoot` itself. */
function gitEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

function runGit(repoRoot: string, args: string[], input?: string): Buffer {
  // A user's log.showSignature would add GPG output to the parsed log.
  const result = spawnSync('git', ['-c', 'log.showSignature=false', ...args], {
    cwd: repoRoot,
    env: gitEnv(),
    input,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? String(result.stderr).trim();
    throw new Error(`git ${args[0]} failed in ${repoRoot}: ${detail}`);
  }
  return result.stdout;
}

/**
 * Parse `git log --raw --no-abbrev -z --format=` output into install path → regular-file blob ids.
 * Only paths under `templates/` that map into a lockfile component are kept.
 */
export function parseRawLog(output: string): Map<string, Set<string>> {
  const blobs = new Map<string, Set<string>>();
  const tokens = output.split('\0');
  for (let index = 0; index < tokens.length; index++) {
    const header = tokens[index].replace(/^\s+/, '');
    if (!header.startsWith(':')) {
      continue;
    }
    index++;
    const templatePath = tokens[index] ?? '';
    const path = templatePath.slice(TEMPLATES_PREFIX.length);
    if (!templatePath.startsWith(TEMPLATES_PREFIX) || !isRetirablePath(path)) {
      continue;
    }
    const [srcMode, dstMode, srcBlob, dstBlob] = header.slice(1).split(' ');
    const ids = blobs.get(path) ?? new Set<string>();
    for (const [mode, blob] of [
      [srcMode, srcBlob],
      [dstMode, dstBlob],
    ]) {
      if (mode?.startsWith('100') && blob !== undefined && !/^0+$/.test(blob)) {
        ids.add(blob);
      }
    }
    blobs.set(path, ids);
  }
  return blobs;
}

/**
 * Parse `git cat-file --batch` output into blob id → SHA-256 of the blob content.
 * @throws when git reports an object as missing, the output is truncated, or an id of
 *   `expectedIds` has no entry
 */
export function parseCatFileBatch(
  output: Buffer,
  expectedIds: readonly string[]
): Map<string, string> {
  const hashes = new Map<string, string>();
  let offset = 0;
  while (offset < output.length) {
    const newline = output.indexOf(0x0a, offset);
    if (newline === -1) {
      throw new Error('truncated git cat-file output');
    }
    const header = output.subarray(offset, newline).toString('utf-8');
    const match = /^([0-9a-f]+) blob (\d+)$/.exec(header);
    if (!match) {
      throw new Error(`unexpected git cat-file output: ${header}`);
    }
    const start = newline + 1;
    const end = start + Number(match[2]);
    if (end > output.length) {
      throw new Error('truncated git cat-file output');
    }
    hashes.set(match[1], createHash('sha256').update(output.subarray(start, end)).digest('hex'));
    offset = end + 1;
  }
  const absent = expectedIds.filter((id) => !hashes.has(id));
  if (absent.length > 0) {
    throw new Error(`git cat-file did not return blob(s): ${absent.join(', ')}`);
  }
  return hashes;
}

function existsInWorkingTree(repoRoot: string, path: string): boolean {
  try {
    lstatSync(join(repoRoot, TEMPLATES_PREFIX, path));
    return true;
  } catch {
    return false;
  }
}

function sortCodeUnits(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Compute the retired template paths of the checkout at `repoRoot`.
 * @throws when git fails or the checkout is shallow
 */
export function generateRetiredTemplatePaths(repoRoot: string): RetiredTemplatePathsFile {
  const shallow = runGit(repoRoot, ['rev-parse', '--is-shallow-repository'])
    .toString('utf-8')
    .trim();
  if (shallow !== 'false') {
    throw new Error(
      `${repoRoot} is a shallow clone: retired template paths require full git history ` +
        '(git fetch --unshallow)'
    );
  }

  // --full-history: history simplification would prune a side branch whose changes a merge
  // discarded (the merge is TREESAME to its first parent), and with it shipped blob versions.
  // With git 2.52, `-m` already lists those commits (measured); the flag states the requirement
  // instead of relying on that.
  const log = runGit(repoRoot, [
    'log',
    '--full-history',
    '-m',
    '--no-renames',
    '--raw',
    '--no-abbrev',
    '-z',
    '--format=',
    '--',
    TEMPLATES_PREFIX,
  ]).toString('utf-8');
  const retired = new Map(
    [...parseRawLog(log)].filter(([path]) => !existsInWorkingTree(repoRoot, path))
  );

  const blobIds = sortCodeUnits(new Set([...retired.values()].flatMap((ids) => [...ids])));
  const hashes =
    blobIds.length === 0
      ? new Map<string, string>()
      : parseCatFileBatch(
          runGit(repoRoot, ['cat-file', '--batch'], `${blobIds.join('\n')}\n`),
          blobIds
        );

  const paths = sortCodeUnits(retired.keys()).map((path) => ({
    path,
    sha256: sortCodeUnits(
      new Set([...(retired.get(path) ?? [])].map((id) => hashes.get(id) ?? ''))
    ),
  }));

  return {
    description: RETIRED_TEMPLATE_PATHS_DESCRIPTION,
    schemaVersion: RETIRED_TEMPLATE_PATHS_SCHEMA_VERSION,
    paths,
  };
}

/** Serialize exactly as committed: 2-space JSON with a trailing newline. */
export function serializeRetiredTemplatePaths(file: RetiredTemplatePathsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * CLI entry point. Writes the file, or with `--check` compares it.
 * @returns process exit code
 */
export function main(argv: readonly string[], repoRoot: string = process.cwd()): number {
  const target = join(repoRoot, 'templates', RETIRED_TEMPLATE_PATHS_FILE);
  let expected: string;
  let count: number;
  try {
    const file = generateRetiredTemplatePaths(repoRoot);
    expected = serializeRetiredTemplatePaths(file);
    count = file.paths.length;
  } catch (err) {
    console.error(`generate-retired-template-paths: ${(err as Error).message}`);
    return 1;
  }

  if (argv.includes('--check')) {
    let actual: string | null = null;
    try {
      actual = readFileSync(target, 'utf-8');
    } catch {
      // A missing file is reported as stale below.
    }
    if (actual !== expected) {
      console.error(
        `generate-retired-template-paths: templates/${RETIRED_TEMPLATE_PATHS_FILE} is stale; ` +
          'run bun run scripts/generate-retired-template-paths.ts'
      );
      return 1;
    }
    console.log(`generate-retired-template-paths: up to date (${count} paths)`);
    return 0;
  }

  writeFileSync(target, expected, 'utf-8');
  console.log(
    `generate-retired-template-paths: wrote templates/${RETIRED_TEMPLATE_PATHS_FILE} (${count} paths)`
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
