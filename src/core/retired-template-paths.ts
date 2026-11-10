/**
 * Retired template paths (#1935)
 *
 * `templates/retired-template-paths.json` lists every file that oh-my-customcode once shipped
 * under a lockfile component (rules, agents, skills, hooks, contexts, ontology, guides) and no
 * longer ships, together with the SHA-256 of every content version it shipped at that path.
 * It is generated from git history by scripts/generate-retired-template-paths.ts and committed.
 *
 * `omcustom update` uses it to remove leftovers that are provably unmodified copies of shipped
 * content; anything else stays on disk.
 */

import { readFile } from 'node:fs/promises';
import { resolveTemplatePath } from '../utils/fs.js';
import { isCanonicalRelativeFilePath, resolveLockfileComponent } from './lockfile.js';

/** File name under `templates/`. */
export const RETIRED_TEMPLATE_PATHS_FILE = 'retired-template-paths.json';

/** Current schema version of the retired template paths file. */
export const RETIRED_TEMPLATE_PATHS_SCHEMA_VERSION = 1 as const;

/** The `description` field written by the generator; documents the schema in the file itself. */
export const RETIRED_TEMPLATE_PATHS_DESCRIPTION =
  'Files oh-my-customcode once shipped under a lockfile component (.claude/rules, .claude/agents, ' +
  '.claude/skills, .claude/hooks, .claude/contexts, .claude/ontology, guides) and no longer ships ' +
  '(#1935). Generated from git history by scripts/generate-retired-template-paths.ts; do not edit ' +
  'by hand. schemaVersion 1: "paths" is sorted by "path" (code-unit order). Each "path" is ' +
  'install-relative with forward slashes. "sha256" lists, sorted, the lowercase hex SHA-256 of ' +
  'every regular-file content version shipped at that path. omcustom update removes a leftover ' +
  'only when it is a regular file whose hash matches both one of these hashes and its entry in ' +
  'the previous .omcustom.lock.json, and the path is not preserved.';

/** One retired path. */
export interface RetiredTemplatePathEntry {
  /** Install-relative path, forward slashes (e.g. `.claude/skills/memory-save/SKILL.md`). */
  path: string;
  /** Lowercase hex SHA-256 of every shipped regular-file version at `path`, sorted. */
  sha256: string[];
}

/** The committed file. */
export interface RetiredTemplatePathsFile {
  description: string;
  schemaVersion: typeof RETIRED_TEMPLATE_PATHS_SCHEMA_VERSION;
  paths: RetiredTemplatePathEntry[];
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** Whether `path` is a canonical relative file path inside one of the lockfile components. */
export function isRetirablePath(path: unknown): path is string {
  return isCanonicalRelativeFilePath(path) && resolveLockfileComponent(path) !== 'unknown';
}

function parseEntry(value: unknown, index: number): RetiredTemplatePathEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`paths[${index}] must be an object`);
  }
  const { path, sha256 } = value as Record<string, unknown>;
  if (!isRetirablePath(path)) {
    throw new Error(`paths[${index}].path must be a canonical path inside a lockfile component`);
  }
  if (
    !Array.isArray(sha256) ||
    !sha256.every((hash) => typeof hash === 'string' && SHA256_PATTERN.test(hash))
  ) {
    throw new Error(`paths[${index}].sha256 must be an array of lowercase hex SHA-256 strings`);
  }
  return { path, sha256: [...sha256] };
}

/**
 * Validate parsed JSON as a retired template paths file.
 * @throws when the shape, a path or a hash is invalid, or a path is listed twice
 */
export function parseRetiredTemplatePaths(data: unknown): RetiredTemplatePathsFile {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('retired template paths must be a JSON object');
  }
  const { description, schemaVersion, paths } = data as Record<string, unknown>;
  if (schemaVersion !== RETIRED_TEMPLATE_PATHS_SCHEMA_VERSION) {
    throw new Error(`unsupported retired template paths schemaVersion: ${String(schemaVersion)}`);
  }
  if (typeof description !== 'string') {
    throw new Error('retired template paths description must be a string');
  }
  if (!Array.isArray(paths)) {
    throw new Error('retired template paths "paths" must be an array');
  }
  const entries = paths.map(parseEntry);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.path)) {
      throw new Error(`retired template path listed twice: ${entry.path}`);
    }
    seen.add(entry.path);
  }
  return { description, schemaVersion, paths: entries };
}

/**
 * Load the retired template paths shipped with this CLI.
 *
 * @param filePath - defaults to `templates/retired-template-paths.json` of this package
 * @returns the entries; an empty array when the file does not exist
 * @throws when the file exists but cannot be read or parsed, or fails validation
 */
export async function loadRetiredTemplatePaths(
  filePath: string = resolveTemplatePath(RETIRED_TEMPLATE_PATHS_FILE)
): Promise<RetiredTemplatePathEntry[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  return parseRetiredTemplatePaths(JSON.parse(raw)).paths;
}
