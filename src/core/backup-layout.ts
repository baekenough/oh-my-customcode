/**
 * Layout of `--backup` copies and their git hygiene (#1943).
 *
 * Claude Code loads `.claude/` skills and rules, and `CLAUDE.md`-style instruction files, from
 * nested directories. A backup that kept those names verbatim would load as active configuration
 * whenever a session touched a file below the backup, so the backup renames them.
 */

import { execFile } from 'node:child_process';
import { type Dirent, constants as fsConstants } from 'node:fs';
import {
  copyFile,
  link,
  readdir,
  readFile,
  readlink,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { fileExists } from '../utils/fs.js';
import { debug, info, warn } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

/**
 * Instruction files Claude Code and other agents load from every directory they work in, in
 * lower case: matching is case-insensitive because a case-insensitive file system opens
 * `CLAUDE.md` for a file named `claude.md`.
 */
const INSTRUCTION_FILES: ReadonlySet<string> = new Set([
  'claude.md',
  'claude.local.md',
  'agents.md',
]);

/** Backup directory prefixes: `update --backup` and `init --backup` (the provider layout's). */
const BACKUP_PREFIXES = ['.omcustom-backup-', '.claude-backup-'] as const;

/** Suffix that keeps a backed-up instruction file from loading. */
const INSTRUCTION_BACKUP_SUFFIX = '.backup';

/** Upper bound on `.backup-N` names tried for one file. */
const MAX_COLLISION_SUFFIX = 1000;

/** Whether `name` is an instruction file that must not keep its name inside a backup. */
export function isInstructionFileName(name: string): boolean {
  return INSTRUCTION_FILES.has(name.toLowerCase());
}

/**
 * The name a top-level item is stored under inside a backup: instruction files get a `.backup`
 * suffix, a leading dot folder loses its dot (`.claude` -> `claude`, the same convention as the
 * retired-file backup), anything else keeps its name.
 */
export function backupEntryName(name: string): string {
  if (isInstructionFileName(name)) return `${name}${INSTRUCTION_BACKUP_SUFFIX}`;
  return name.replace(/^\.+/, '');
}

function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}

/**
 * Move `from` to `to` without ever replacing something at `to`: the target is created
 * exclusively (a hard link, or an exclusive copy where links are unsupported), then `from` is
 * removed. Throws EEXIST when `to` is taken, leaving `from` in place.
 */
async function moveWithoutOverwrite(from: string, to: string, isLink: boolean): Promise<void> {
  if (isLink) {
    await symlink(await readlink(from), to);
  } else {
    try {
      await link(from, to);
    } catch (err) {
      if (errorCode(err) === 'EEXIST') throw err;
      try {
        await copyFile(from, to, fsConstants.COPYFILE_EXCL);
      } catch (copyErr) {
        // A failed copy can leave a partial file; EEXIST means `to` is not ours to remove
        if (errorCode(copyErr) !== 'EEXIST') await unlink(to).catch(() => undefined);
        throw copyErr;
      }
    }
  }
  try {
    await unlink(from);
  } catch (err) {
    // Both names would remain and the original would still load: take the new name back
    await unlink(to).catch(() => undefined);
    throw err;
  }
}

/** `file.backup`, or `file.backup-1`, `file.backup-2`, … when the earlier names are taken. */
async function renameToBackupName(path: string, isLink: boolean): Promise<string> {
  for (let n = 0; n <= MAX_COLLISION_SUFFIX; n++) {
    const target = `${path}${INSTRUCTION_BACKUP_SUFFIX}${n === 0 ? '' : `-${n}`}`;
    try {
      await moveWithoutOverwrite(path, target, isLink);
      return target;
    } catch (err) {
      if (errorCode(err) !== 'EEXIST') throw err;
    }
  }
  throw new Error(`no free backup name for ${path}`);
}

/** A renamed instruction file whose plain `.backup` name was taken: it got `.backup-N`. */
export interface CollidedRename {
  /** Where it is now, relative to the backup root (`…/CLAUDE.md.backup-1`) */
  stored: string;
  /** What to rename it back to, relative to the backup root (`…/CLAUDE.md`) */
  original: string;
}

/** Result of {@link renameNestedInstructionFilesDetailed}. */
export interface NestedRenameResult {
  /** How many instruction files were renamed (collided ones included) */
  renamed: number;
  /** The renamed files that got a `.backup-N` name because `.backup` was taken */
  collided: CollidedRename[];
}

/** Rename one instruction file, recording the result; a failure is a warning, never fatal. */
async function renameOneInstructionFile(
  base: string,
  path: string,
  isLink: boolean,
  out: NestedRenameResult
): Promise<void> {
  try {
    const target = await renameToBackupName(path, isLink);
    out.renamed++;
    if (target !== `${path}${INSTRUCTION_BACKUP_SUFFIX}`) {
      out.collided.push({ stored: relative(base, target), original: relative(base, path) });
    }
  } catch (err) {
    warn('backup.instruction_rename_failed', {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function renameNestedInto(base: string, dir: string, out: NestedRenameResult): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await renameNestedInto(base, path, out);
    } else if (isInstructionFileName(entry.name)) {
      await renameOneInstructionFile(base, path, entry.isSymbolicLink(), out);
    }
  }
}

/**
 * Give every instruction file at any depth below `root` the `.backup` suffix (symlinked
 * directories are not followed). A name that is already taken is never overwritten: the file gets
 * `.backup-1`, `.backup-2`, … instead and is reported in `collided`. One that cannot be renamed
 * is left as it was (undone if half done) with a warning, never fatal.
 */
export async function renameNestedInstructionFilesDetailed(
  root: string
): Promise<NestedRenameResult> {
  const out: NestedRenameResult = { renamed: 0, collided: [] };
  await renameNestedInto(root, root, out);
  return out;
}

/** {@link renameNestedInstructionFilesDetailed}, returning only how many were renamed. */
export async function renameNestedInstructionFiles(root: string): Promise<number> {
  return (await renameNestedInstructionFilesDetailed(root)).renamed;
}

/** One rename a restore needs: `stored` (inside the backup) back to `original` (project root). */
export interface BackupRename {
  stored: string;
  original: string;
}

/** The renames needed to restore the given top-level items; items stored unchanged are omitted. */
export function backupRestoreRenames(names: readonly string[]): BackupRename[] {
  return names
    .map((original) => ({ stored: backupEntryName(original), original }))
    .filter((rename) => rename.stored !== rename.original);
}

/**
 * Log one hint line naming every rename and, when `nestedRenamed` instruction files deeper in
 * the backup got the suffix, saying so (and how a taken name was resolved); nothing when there is
 * nothing to restore by renaming.
 */
export function logBackupRestoreHint(
  backupDir: string,
  names: readonly string[],
  nestedRenamed = 0,
  collided: readonly CollidedRename[] = []
): void {
  const renames = backupRestoreRenames(names).map((r) => `${r.stored} -> ${r.original}`);
  const plain = nestedRenamed - collided.length;
  if (plain > 0) {
    renames.push(
      `nested *.md.backup (${plain}) -> drop the .backup suffix` +
        (collided.length > 0 ? ' (except the files named in this hint)' : '')
    );
  }
  // The plain `.backup` next to a collided file was already there: it is the user's and stays
  for (const c of collided) {
    renames.push(`${c.stored} -> ${c.original} (the existing .backup file next to it stays)`);
  }
  if (renames.length === 0) return;
  info('backup.restore_hint', { path: backupDir, renames: renames.join('\n  ') });
}

async function git(cwd: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync('git', args, { cwd });
    return true;
  } catch {
    return false;
  }
}

/** What git says about a backup directory: ignored, un-ignored by a `!` pattern, or neither. */
type IgnoreStatus = 'ignored' | 'negated' | 'none' | 'unknown';

/**
 * Ask git, from every ignore source (.gitignore, .git/info/exclude, global excludes).
 * `check-ignore -v --no-index` prints `<source>:<line>:<pattern>\t<path>`; a pattern starting with
 * `!` is a negation. Exit 1 means no pattern matches; any other failure is 'unknown'.
 */
async function ignoreStatus(
  cwd: string,
  name: string
): Promise<{ status: IgnoreStatus; source?: string }> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['check-ignore', '-v', '--no-index', '--', name],
      {
        cwd,
      }
    );
    const negation = /^([^\t]*?):\d+:!/.exec(stdout);
    return negation ? { status: 'negated', source: negation[1] } : { status: 'ignored' };
  } catch (err) {
    return { status: (err as { code?: unknown }).code === 1 ? 'none' : 'unknown' };
  }
}

/** Fallback when git cannot answer: a `!` line in .gitignore naming this prefix. */
function textNegates(gitignore: string, prefix: string): boolean {
  return gitignore.split(/\r?\n/).some((raw) => {
    const line = raw.trim();
    return line.startsWith('!') && line.slice(1).replace(/^\//, '').startsWith(prefix);
  });
}

/**
 * Per prefix: `missing` when the pattern line is absent and some backup directory is not ignored;
 * `negated` when something un-ignores a backup directory, so a pattern appended after it would
 * override a deliberate choice.
 */
async function classifyPrefixes(
  targetDir: string,
  backupNames: readonly string[],
  gitignore: string
): Promise<{ missing: string[]; negated: string[]; negationSources: string[] }> {
  const lines = new Set(gitignore.split(/\r?\n/).map((line) => line.trim()));
  const missing: string[] = [];
  const negated: string[] = [];
  const negationSources = new Set<string>();
  for (const prefix of BACKUP_PREFIXES) {
    const pattern = `${prefix}*/`;
    const statuses: IgnoreStatus[] = [];
    for (const name of backupNames.filter((n) => n.startsWith(prefix))) {
      const found = await ignoreStatus(targetDir, name);
      statuses.push(found.status);
      if (found.source) negationSources.add(found.source);
    }
    if (
      statuses.includes('negated') ||
      (statuses.includes('unknown') && textNegates(gitignore, prefix))
    ) {
      negated.push(pattern);
    } else if (!lines.has(pattern) && statuses.some((s) => s === 'none' || s === 'unknown')) {
      missing.push(pattern);
    }
  }
  return { missing, negated, negationSources: [...negationSources] };
}

/**
 * Make sure the project `.gitignore` ignores the backup directories this tool leaves in the
 * project root. Idempotent, does nothing outside a git work tree, creates `.gitignore` only when
 * it is absent, never writes in a dry run and never throws. A prefix whose backup directories git
 * reports as un-ignored by a `!` pattern is left alone (decided per prefix). Returns whether it
 * changed the file.
 */
export async function ensureBackupGitignore(
  targetDir: string,
  options: { dryRun?: boolean } = {}
): Promise<boolean> {
  try {
    const entries = await readdir(targetDir, { withFileTypes: true });
    const backupNames = entries
      .filter(
        (entry) => entry.isDirectory() && BACKUP_PREFIXES.some((p) => entry.name.startsWith(p))
      )
      .map((entry) => entry.name);
    if (backupNames.length === 0) return false;
    if (!(await git(targetDir, ['rev-parse', '--is-inside-work-tree']))) return false;

    const gitignorePath = join(targetDir, '.gitignore');
    const existing = (await fileExists(gitignorePath))
      ? await readFile(gitignorePath, 'utf-8')
      : '';
    const { missing, negated, negationSources } = await classifyPrefixes(
      targetDir,
      backupNames,
      existing
    );
    if (negated.length > 0) {
      // An appended pattern would override the user's deliberate un-ignore. Name the file git
      // reports (e.g. .git/info/exclude), or the .gitignore when git could not say.
      info('backup.gitignore_negated', {
        path: negationSources.length > 0 ? negationSources.join(', ') : gitignorePath,
        target: gitignorePath,
        patterns: negated.join(', '),
      });
    }
    if (missing.length === 0) return false;
    if (options.dryRun) {
      debug('backup.gitignore_dry_run', { patterns: missing.join(', ') });
      return false;
    }

    const eol = existing.includes('\r\n') ? '\r\n' : '\n';
    const base = existing === '' || existing.endsWith('\n') ? existing : `${existing}${eol}`;
    const separator = base === '' ? '' : eol;
    await writeFile(
      gitignorePath,
      `${base}${separator}# oh-my-customcode backups${eol}${missing.join(eol)}${eol}`,
      'utf-8'
    );
    info('backup.gitignore_updated', { path: gitignorePath, patterns: missing.join(', ') });
    return true;
  } catch (err) {
    debug('backup.gitignore_failed', { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
