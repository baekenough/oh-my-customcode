/**
 * Updater module - Update agents from source
 */

import { constants as fsConstants } from 'node:fs';
import {
  copyFile,
  link,
  lstat,
  mkdir,
  readdir,
  realpath,
  rm,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { dirname as posixDirname } from 'node:path/posix';
import packageJson from '../../package.json';
import { i18n } from '../i18n/index.js';
import {
  copyDirectory,
  ensureDirectory,
  fileExists,
  readJsonFile,
  readTextFile,
  resolveTemplatePath,
  validatePreserveFilePath,
  writeJsonFile,
  writeTextFile,
} from '../utils/fs.js';
import { debug, error, info, success, warn } from '../utils/logger.js';
import {
  backupEntryName,
  ensureBackupGitignore,
  isInstructionFileName,
  logBackupRestoreHint,
  renameNestedInstructionFilesDetailed,
} from './backup-layout.js';
import { installCodex, isCodexInstalled } from './codex-installer.js';
import { loadConfig, type OmccConfig, saveConfig } from './config.js';
import { mergeEntryDoc, wrapInManagedMarkers } from './entry-merger.js';
import { isProtectedFile } from './file-preservation.js';
import { migrateHookCommands } from './hook-command-migration.js';
import { findRtkInterceptMentions, stripRtkInterceptHooks } from './hook-group-merge.js';
import { getProviderLayout } from './layout.js';
import {
  computeFileHash,
  generateAndWriteLockfileForDir,
  LOCKFILE_VERSION,
  type Lockfile,
  type LockfileEntry,
  readLockfile,
  resolveLockfileComponent,
  writeLockfile,
} from './lockfile.js';
import {
  isRetirablePath,
  loadRetiredTemplatePaths,
  type RetiredTemplatePathEntry,
} from './retired-template-paths.js';
import {
  countSkillDirectories,
  listSkippedPackageSkills,
  withDeployedSkillCount,
} from './scope-filter.js';

/**
 * Options for update operation
 */
export interface UpdateOptions {
  /** Target directory to update */
  targetDir: string;
  /** Specific components to update (default: all) */
  components?: UpdateComponent[];
  /** Whether to force update even if no changes */
  force?: boolean;
  /** Whether to preserve user customizations */
  preserveCustomizations?: boolean;
  /** Force overwrite all files, bypassing all preservation mechanisms */
  forceOverwriteAll?: boolean;
  /** Dry run - show what would be updated without making changes */
  dryRun?: boolean;
  /** Whether to backup before updating */
  backup?: boolean;
  /** Sync frontmatter name: field from upstream in unmodified files */
  hard?: boolean;
  /**
   * Asked once per update, with the sorted paths and the backup directory they would be moved to,
   * before leftovers that oh-my-customcode no longer ships are moved into the backup folder at the
   * project root, `.omcustom-backup-<timestamp>/retired/` (#1941, #1938). Called only when at
   * least one file passed every retirement condition and this is not a dry run. `true` moves
   * them; `false` keeps them all (recorded in `orphanRetirement.preserved`
   * with `keptBy: 'declined'`, ownership carried forward so the next update can ask again); a
   * throw or a rejection also keeps them all, as an actionable keep with a warning. Omitted: they
   * are moved without asking.
   */
  confirmOrphanRemoval?: OrphanRemovalConfirmation;
}

/** What `UpdateOptions.confirmOrphanRemoval` is told besides the paths. */
export interface OrphanRemovalContext {
  /**
   * The directory the files would be moved to: `<targetDir>/.omcustom-backup-<timestamp>/retired`
   * (the same timestamped directory as `--backup` when that ran in this update). It is created
   * only when the first file is moved.
   */
  backupDir: string;
}

/**
 * Decides whether the listed leftovers may be moved to the backup (see
 * `UpdateOptions.confirmOrphanRemoval`).
 */
export type OrphanRemovalConfirmation = (
  paths: readonly string[],
  context: OrphanRemovalContext
) => Promise<boolean>;

/**
 * Why a leftover was kept on purpose (#1938): covered by the user's preserve settings, or the user
 * declined the confirmation. Such keeps get no per-file warning and are not in `preservedFiles`.
 */
export type OrphanKeptBy = 'preserve-settings' | 'declined';

/** A leftover that was kept, with the reason; `keptBy` is set only for a deliberate keep. */
export interface OrphanKeep {
  path: string;
  reason: string;
  keptBy?: OrphanKeptBy;
}

/**
 * Components that can be updated
 */
export type UpdateComponent =
  | 'rules'
  | 'agents'
  | 'skills'
  | 'guides'
  | 'hooks'
  | 'contexts'
  | 'ontology';

/**
 * Result of update operation
 */
export interface UpdateResult {
  /** Whether update was successful */
  success: boolean;
  /** Components that were updated */
  updatedComponents: UpdateComponent[];
  /** Components that were skipped */
  skippedComponents: UpdateComponent[];
  /**
   * Files that were preserved (user customizations). Retired leftovers are listed here only when
   * they were kept for a reason that needs attention (modified, unowned, ...); leftovers kept on
   * purpose (`orphanRetirement.preserved` entries with `keptBy`) are not.
   */
  preservedFiles: string[];
  /** Backed up paths */
  backedUpPaths: string[];
  /** Previous version */
  previousVersion: string;
  /** New version */
  newVersion: string;
  /** Any warnings during update */
  warnings: string[];
  /** Root-level files that were synced */
  syncedRootFiles: string[];
  /** Deprecated files that were removed (retired leftovers: moved to the backup) */
  removedDeprecatedFiles: string[];
  /**
   * The one backup folder of this run for everything it retired: orphan leftovers, RTK files and
   * `deprecated-files.json` entries are moved here, never deleted. Created on the first move;
   * present only when at least one file was moved.
   */
  retiredBackupDir?: string;
  /** Files whose frontmatter name: was synced from upstream */
  namespaceSynced: string[];
  /** True when the target was skipped because it is the source project itself */
  skippedSource?: boolean;
  /** Error message if failed */
  error?: string;
  /** Exact RTK retirement decisions; dry-run reports plans without changing target bytes. */
  rtkRetirement?: {
    removed: string[];
    wouldRemove: string[];
    preserved: { path: string; reason: string }[];
    settingsChanged: string[];
    wouldChangeSettings: string[];
    settingsConflicts: string[];
  };
  /**
   * Leftovers that oh-my-customcode no longer ships (templates/retired-template-paths.json,
   * #1935). `removed` were moved into `backupDir`, the backup folder at the project root
   * (`.omcustom-backup-<timestamp>/retired/`, #1938); dry-run lists them
   * in `wouldRemove` instead and creates nothing. `preserved` were kept, with the reason; those
   * without `keptBy` are also in `preservedFiles` and `warnings`, deliberate keeps (`keptBy`) are
   * only here. Present when the retired list was evaluated.
   */
  orphanRetirement?: {
    removed: string[];
    wouldRemove: string[];
    preserved: OrphanKeep[];
    /**
     * Where `removed` went: `<targetDir>/.omcustom-backup-<timestamp>/retired`, keeping each
     * project-relative path except that a leading dot folder loses its dot (`.claude/skills/x`
     * is at `<backupDir>/claude/skills/x`), so Claude Code does not discover the backed-up files
     * as live skills or agents. Present when at least one file was moved.
     */
    backupDir?: string;
  };
}

/**
 * Result of checking for updates
 */
export interface UpdateCheckResult {
  /** Whether updates are available */
  hasUpdates: boolean;
  /** Current installed version */
  currentVersion: string;
  /** Latest available version */
  latestVersion: string;
  /** Components with available updates */
  updatableComponents: {
    name: UpdateComponent;
    currentVersion: string;
    latestVersion: string;
    changesSummary?: string;
  }[];
  /** Last check timestamp */
  checkedAt: string;
}

/**
 * Agent version information
 */
export interface AgentVersion {
  /** Agent name */
  name: string;
  /** Current version */
  version: string;
  /** Source (local or external URL) */
  source: string;
  /** Last updated timestamp */
  lastUpdated: string;
  /** Whether it has local modifications */
  hasLocalModifications: boolean;
}

/**
 * Component version tracking (reserved for future use)
 */
interface _ComponentVersions {
  [component: string]: {
    version: string;
    lastUpdated: string;
    checksum?: string;
  };
}

/**
 * User customization manifest
 */
export interface CustomizationManifest {
  /** Files that have been modified by user */
  modifiedFiles: string[];
  /** Files that should be preserved during update */
  preserveFiles: string[];
  /** Custom agents/skills created by user */
  customComponents: string[];
  /** Last updated */
  lastUpdated: string;
}

const CUSTOMIZATION_MANIFEST_FILE = '.omcustom-customizations.json';

const RETIRED_RTK_FILES = [
  { path: '.claude/skills/rtk-exec/SKILL.md', component: 'skills' },
  { path: '.claude/skills/rtk-exec/scripts/rtk-wrapper.cjs', component: 'skills' },
  { path: '.claude/hooks/scripts/rtk-intercept.sh', component: 'hooks' },
] as const;

function getRtkRetirement(result: UpdateResult) {
  result.rtkRetirement ??= {
    removed: [],
    wouldRemove: [],
    preserved: [],
    settingsChanged: [],
    wouldChangeSettings: [],
    settingsConflicts: [],
  };
  return result.rtkRetirement;
}

/**
 * Existing regular files only; neither target symlinks nor parent escapes are owned.
 * With `exactLocation`, the file must also resolve to exactly `<realpath(targetDir)>/<path>`,
 * so no directory on the way is a symlink (not even one that stays inside the project).
 * Throws an ENOENT error when the file does not exist.
 */
export async function validateOwnedTarget(
  targetDir: string,
  path: string,
  exactLocation = false
): Promise<void> {
  const validation = validatePreserveFilePath(path, targetDir);
  if (!validation.valid) throw new Error('path escapes project');
  const fullPath = resolve(targetDir, path);
  const fileStat = await lstat(fullPath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('not a regular owned file');
  const root = await realpath(targetDir);
  const resolvedFile = await realpath(fullPath);
  const within = relative(root, resolvedFile);
  if (within === '' || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new Error('resolved path escapes project');
  }
  if (exactLocation && resolvedFile !== resolve(root, path)) {
    throw new Error('path goes through a symlinked directory');
  }
}

/** String entries of a manifest list; anything else (a hand-edited manifest) is ignored. */
function manifestPaths(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

/**
 * A preserve-like entry as a plain project-relative prefix: leading `./` and trailing `/`
 * (repeated) are removed, so `./.claude/skills/x/` and `.claude/skills/x` mean the same.
 * Non-strings and entries that end up empty (`''`, `/`, `./`) yield null: they must never match
 * (an empty prefix would preserve everything). Backslashes are left alone, as everywhere else
 * these lists are read.
 */
function normalizePreserveEntry(entry: unknown): string | null {
  if (typeof entry !== 'string') return null;
  let normalized = entry;
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized === '' ? null : normalized;
}

/**
 * Whether `path` is kept by an explicit preservation source: config `preserveFiles` and
 * `customComponents`, and the customization manifest's `preserveFiles`, `modifiedFiles` and
 * `customComponents`. An entry preserves itself and everything below it (entries are normalized
 * first, see `normalizePreserveEntry`). Used for deletion decisions only; overwrite semantics
 * in `updateComponent` are separate.
 */
export function isPathPreserved(
  path: string,
  config: OmccConfig,
  customizations: CustomizationManifest | null
): boolean {
  const paths = [
    ...(Array.isArray(config.preserveFiles) ? config.preserveFiles : []),
    ...manifestPaths(customizations?.preserveFiles),
    ...manifestPaths(customizations?.modifiedFiles),
    ...manifestPaths(customizations?.customComponents),
    ...(Array.isArray(config.customComponents) ? config.customComponents : []).map(
      (component) => component?.path
    ),
  ];
  return paths.some((entry) => {
    const preserved = normalizePreserveEntry(entry);
    return preserved !== null && (path === preserved || path.startsWith(`${preserved}/`));
  });
}

/** The manifest exists but cannot be read: every deletion candidate is kept. */
export const UNREADABLE_MANIFEST = 'customization manifest unreadable';

/**
 * Preservation sources for deletions (RTK and orphan retirement). Overwrite is not delete:
 * `forceOverwriteAll` bypasses preservation for template copies only, so the manifest is loaded
 * here even then. Only `preserveCustomizations: false` (an explicit API opt-out; the CLI always
 * passes `true`) leaves the manifest out. A manifest that exists but cannot be read keeps every
 * candidate (fail closed) instead of failing the update.
 */
export type DeletionCustomizations = CustomizationManifest | null | typeof UNREADABLE_MANIFEST;

export async function loadDeletionCustomizations(
  options: UpdateOptions
): Promise<DeletionCustomizations> {
  if (options.preserveCustomizations === false) return null;
  try {
    return await loadCustomizationManifest(options.targetDir);
  } catch {
    return UNREADABLE_MANIFEST;
  }
}

/** The reason a deletion candidate is kept by preservation, or null when it is not. */
export function deletionPreservedReason(
  path: string,
  config: OmccConfig,
  customizations: DeletionCustomizations
): string | null {
  if (customizations === UNREADABLE_MANIFEST) return UNREADABLE_MANIFEST;
  return isPathPreserved(path, config, customizations) ? EXPLICITLY_PRESERVED : null;
}

/** `deletionPreservedReason` for a path the preserve settings cover. */
const EXPLICITLY_PRESERVED = 'explicitly preserved';

/** What `update` deletes of the retired RTK feature, relative to the project root. */
const RTK_DELETE_TARGETS = ['.claude/skills/rtk-exec', '.claude/hooks/scripts/rtk-intercept.sh'];

/** Runs whose RTK settings wiring was already stripped, so it is not handled twice. */
const rtkSettingsHandled = new WeakSet<UpdateResult>();

/** Files at or below an RTK target without following symlinks (a symlink is one entry). */
async function listRtkEntries(absolute: string, relativePath: string): Promise<string[]> {
  if (!(await lstat(absolute)).isDirectory()) return [relativePath];
  const entries: string[] = [];
  for (const name of await readdir(absolute)) {
    entries.push(...(await listRtkEntries(join(absolute, name), `${relativePath}/${name}`)));
  }
  return entries.length > 0 ? entries : [relativePath];
}

/** Warn when an RTK file is deleted although it was modified, unowned or preserved. */
async function noteRtkDeletion(
  options: UpdateOptions,
  lockfile: Lockfile | null,
  result: UpdateResult,
  path: string,
  preservedReason: string | null
): Promise<void> {
  const reasons: string[] = [];
  const owned = ownedLockEntry(lockfile, path);
  try {
    const absolute = join(options.targetDir, path);
    const unchanged =
      owned !== null &&
      (await lstat(absolute)).isFile() &&
      (await computeFileHash(absolute)) === owned.templateHash;
    if (!unchanged) reasons.push('modified or not recorded in the lockfile');
  } catch {
    reasons.push('modified or not recorded in the lockfile');
  }
  if (preservedReason) reasons.push('covered by your preserve settings');
  if (reasons.length > 0) {
    result.warnings.push(
      `RTK is retired: ${options.dryRun ? 'would delete' : 'deleted'} ${path} although it was ${reasons.join(' and ')}`
    );
  }
}

/**
 * Delete one RTK target (a file, a directory tree or a symlink; a symlink is removed itself and
 * never followed). The target's parent must resolve inside the project, else it is skipped with a
 * warning. Any failure is a warning; the next update retries. Dry-run only lists.
 */
async function deleteRtkTarget(
  relativePath: string,
  options: UpdateOptions,
  lockfile: Lockfile | null,
  result: UpdateResult,
  config: OmccConfig,
  customizations: DeletionCustomizations
): Promise<void> {
  const retirement = getRtkRetirement(result);
  const absolute = join(options.targetDir, relativePath);
  try {
    let isDirectory: boolean;
    try {
      isDirectory = (await lstat(absolute)).isDirectory();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return;
      throw err;
    }
    const root = await realpath(options.targetDir);
    const parent = await realpath(dirname(absolute));
    if (parent !== root && !parent.startsWith(`${root}${sep}`)) {
      throw new Error('its parent directory resolves outside the project');
    }
    const entries = isDirectory ? await listRtkEntries(absolute, relativePath) : [relativePath];
    for (const path of entries) {
      await noteRtkDeletion(
        options,
        lockfile,
        result,
        path,
        deletionPreservedReason(path, config, customizations)
      );
    }
    if (options.dryRun) {
      retirement.wouldRemove.push(...entries);
      return;
    }
    if (isDirectory) await rm(absolute, { recursive: true });
    else await unlink(absolute);
    retirement.removed.push(...entries);
    result.removedDeprecatedFiles.push(...entries);
  } catch (err) {
    const reason = errorMessage(err, String(err));
    retirement.preserved.push({ path: relativePath, reason });
    result.warnings.push(`RTK retirement did not delete ${relativePath}: ${reason}`);
  }
}

/**
 * Delete the retired RTK feature (no backup): its settings wiring first (a hook must not point at
 * a deleted script), then the skill directory and the hook script. Independent of lock ownership,
 * modification, preserve settings, settings conflicts and the selected components. Returns the
 * RTK lock paths for the lock regeneration.
 */
async function retireRtkFiles(
  options: UpdateOptions,
  lockfile: Lockfile | null,
  result: UpdateResult,
  config: OmccConfig,
  customizations: DeletionCustomizations
): Promise<string[]> {
  getRtkRetirement(result);
  if (!rtkSettingsHandled.has(result)) {
    await migrateHookCommandsInSettingsLocal(options.targetDir, options, result, false);
  }
  for (const target of RTK_DELETE_TARGETS) {
    await deleteRtkTarget(target, options, lockfile, result, config, customizations);
  }
  return RETIRED_RTK_FILES.map((file) => file.path);
}

/** RTK paths stay on the dedicated RTK flow above (deleted, never moved to the backup). */
const RTK_RETIRED_PATHS: ReadonlySet<string> = new Set(RETIRED_RTK_FILES.map((file) => file.path));

/** A lock key of the retired RTK feature (its three template files). */
function isRtkLockKey(path: string): boolean {
  return RTK_RETIRED_PATHS.has(path) || path.startsWith('.claude/skills/rtk-exec/');
}

function isUpdateComponent(value: string): value is UpdateComponent {
  return (getAllUpdateComponents() as string[]).includes(value);
}

function getOrphanRetirement(result: UpdateResult) {
  result.orphanRetirement ??= { removed: [], wouldRemove: [], preserved: [] };
  return result.orphanRetirement;
}

/** Whether `path` (relative to the package templates/) exists, including as a symlink. */
export async function templatePathExists(path: string): Promise<boolean> {
  try {
    await lstat(resolveTemplatePath(path));
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the directories of `path` that became empty, deepest first, up to but not including
 * the component root. Stops at the first directory that cannot be removed (not empty, missing,
 * or not a directory).
 */
async function removeEmptyParentDirectories(
  targetDir: string,
  path: string,
  componentRoot: string
): Promise<void> {
  for (
    let dir = posixDirname(path);
    dir !== componentRoot && dir.startsWith(`${componentRoot}/`);
    dir = posixDirname(dir)
  ) {
    try {
      await rmdir(join(targetDir, dir));
    } catch {
      return;
    }
  }
}

/** A leftover that passed every retirement condition, with the hash that was verified. */
interface OrphanCandidate {
  path: string;
  componentRoot: string;
  diskHash: string;
}

/**
 * Keep a leftover and record why in `orphanRetirement.preserved`. An actionable keep (no
 * `keptBy`) is also added to `preservedFiles` and gets a warning; a deliberate keep (#1938: the
 * user's preserve settings, or a declined confirmation) is reported once by the CLI instead.
 */
function keepOrphan(
  result: UpdateResult,
  path: string,
  reason: string,
  keptBy?: OrphanKeptBy
): void {
  const retirement = getOrphanRetirement(result);
  if (keptBy) {
    retirement.preserved.push({ path, reason, keptBy });
    return;
  }
  retirement.preserved.push({ path, reason });
  result.preservedFiles.push(path);
  result.warnings.push(`Orphan retirement preserved ${path}: ${reason}`);
}

/** Record a failed check of a leftover as kept; a missing file (ENOENT) is not recorded. */
function keepOrphanAfterError(result: UpdateResult, path: string, err: unknown): void {
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
  keepOrphan(result, path, errorMessage(err, 'unreadable ownership or file'));
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Decide whether one leftover can be retired, or keep it and record why. Retirement requires: no
 * template counterpart, a regular non-symlink file at exactly that location in the project, not
 * preserved, an old lock entry with a valid sha256, disk hash == old lock hash, and disk hash ==
 * a shipped version. Returns the candidate when every condition holds, else null. Nothing is
 * moved here: see {@link moveOrphanToBackup}.
 */
async function retireOrphanFile(
  entry: RetiredTemplatePathEntry,
  componentRoot: string,
  options: UpdateOptions,
  lockfile: Lockfile | null,
  result: UpdateResult,
  preservedReason: string | null
): Promise<OrphanCandidate | null> {
  const { path } = entry;
  try {
    // Still shipped: not an orphan (the generator excludes these; this guards a stale list).
    if (await templatePathExists(path)) return null;
    if (preservedReason === EXPLICITLY_PRESERVED) {
      // A deliberate keep, decided before the location check: a preserved path that is (or sits
      // under) a symlink is kept quietly too. It is never moved; a missing one is not recorded.
      if (await pathExists(join(options.targetDir, path))) {
        keepOrphan(result, path, preservedReason, 'preserve-settings');
      }
      return null;
    }
    await validateOwnedTarget(options.targetDir, path, true);
    if (preservedReason) throw new Error(preservedReason);
    const lockEntry = ownedLockEntry(lockfile, path);
    if (!lockEntry) {
      throw new Error('missing or invalid old ownership');
    }
    const diskHash = await computeFileHash(join(options.targetDir, path));
    if (diskHash !== lockEntry.templateHash) throw new Error('user-modified file');
    if (!entry.sha256.includes(diskHash)) {
      throw new Error('content does not match any shipped version');
    }
    return { path, componentRoot, diskHash };
  } catch (err) {
    keepOrphanAfterError(result, path, err);
    return null;
  }
}

/** The folder inside a backup that receives retired leftovers (#1938). */
const RETIRED_BACKUP_SUBDIR = 'retired';

/** The backup directory of one `update()` run (#1938). */
interface RetiredBackup {
  /** `<targetDir>/.omcustom-backup-<timestamp>` */
  root: string;
  /** `<root>/retired`: the moved files go below it */
  dir: string;
  /**
   * The directories this run created for the backup (absolute). Only these are ever removed
   * again; the root of this run's `--backup` copy, or anything that existed before, never is.
   */
  created: Set<string>;
}

/** The `.omcustom-backup-<timestamp>` name part shared with `--backup`. */
function backupTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Plan (not create) this run's backup for retired leftovers: inside this run's `--backup` copy
 * when there is one, so a run has one backup directory, else a new
 * `<targetDir>/.omcustom-backup-<timestamp>`.
 */
function planRetiredBackup(targetDir: string, result: UpdateResult): RetiredBackup {
  const planned = plannedBackups.get(result);
  if (planned) return planned;
  const installationBackup = result.backedUpPaths[0];
  const root = installationBackup ?? join(targetDir, `.omcustom-backup-${backupTimestamp()}`);
  const backup: RetiredBackup = {
    root,
    dir: join(root, RETIRED_BACKUP_SUBDIR),
    created: new Set(),
  };
  plannedBackups.set(result, backup);
  return backup;
}

/**
 * The backup planned for each run, so orphan leftovers, RTK files and deprecated files share one
 * folder (and one timestamp) however many steps move something.
 */
const plannedBackups = new WeakMap<UpdateResult, RetiredBackup>();

/**
 * Where a leftover goes inside the backup: its project-relative path, except that a leading dot
 * folder loses its dot (`.claude/skills/x/SKILL.md` -> `claude/skills/x/SKILL.md`), so the backup
 * holds no `.claude` directory for Claude Code to discover skills or agents in. A file named
 * CLAUDE.md, CLAUDE.local.md or AGENTS.md gets a `.backup` suffix at any depth.
 */
export function retiredBackupPath(path: string): string {
  const [first = '', ...rest] = path.split('/');
  // A `..` segment would leave the backup folder; the callers' path validation rejects it first.
  if ([first, ...rest].includes('..')) throw new Error('backup path leaves the backup folder');
  const parts = [first.replace(/^\.+/, ''), ...rest];
  // Instruction files keep no loadable name at any depth (same suffix as the --backup layout).
  const last = parts.length - 1;
  if (isInstructionFileName(parts[last] ?? '')) parts[last] = `${parts[last]}.backup`;
  return parts.join('/');
}

/**
 * Whether something (a file, a directory or a symlink, even a dangling one) exists at `path`.
 * Only ENOENT and ENOTDIR mean "absent"; any other lstat error (EIO, EACCES, ...) leaves the
 * state unknown and is rethrown, so it is never read as "the file is gone" (#1944).
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return false;
    throw err;
  }
}

/** `pathExists` for decisions that must not guess: a failed lstat is 'unknown'. */
async function presenceOf(path: string): Promise<'present' | 'absent' | 'unknown'> {
  try {
    return (await pathExists(path)) ? 'present' : 'absent';
  } catch {
    return 'unknown';
  }
}

/**
 * Remove the directories this run created in the backup that are empty now, deepest first (a
 * child path is longer than its parent). Directories that existed before are never touched.
 */
async function removeCreatedEmptyDirectories(backup: RetiredBackup): Promise<void> {
  const dirs = [...backup.created].sort((a, b) => b.length - a.length);
  for (const dir of dirs) {
    try {
      await rmdir(dir);
      backup.created.delete(dir);
    } catch {
      // Not empty (it holds a moved file or a copy that stays) or gone: keep it.
    }
  }
}

/** Remove a copy that must not stay in the backup; a failure leaves it there. */
async function removeBackupCopy(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // The copy stays; the original is intact either way.
  }
}

/**
 * Create the destination's directory one level at a time from `targetDir`, recording each
 * directory created in `created`. Every level must be a real directory (lstat, no symlink), so
 * nothing is ever created through a symlink; nothing may exist at the destination yet.
 */
async function prepareBackupDestination(
  targetDir: string,
  destination: string,
  created: Set<string>
): Promise<void> {
  let dir = targetDir;
  for (const part of relative(targetDir, dirname(destination)).split(sep)) {
    dir = join(dir, part);
    try {
      await mkdir(dir);
      created.add(dir);
    } catch (err) {
      // EEXIST: an existing entry, checked below like a created one.
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    const dirStat = await lstat(dir);
    if (dirStat.isSymbolicLink()) throw new Error('backup location goes through a symlink');
    if (!dirStat.isDirectory()) throw new Error('backup location is not a directory');
  }
  if (await pathExists(destination)) {
    throw new Error('a file already exists at the backup location');
  }
}

/** The original changed after it was copied (#1938 L3); the move was undone. */
class SourceChangedError extends Error {
  constructor() {
    super('user-modified file');
    this.name = 'SourceChangedError';
  }
}

/**
 * Error codes of `link` that mean "no hard link here, copy instead": another file system (EXDEV),
 * a file system without hard links or a policy that forbids them (EPERM, ENOTSUP, EOPNOTSUPP,
 * ENOSYS), a file at its link limit (EMLINK). Any other code is a real failure.
 */
const LINK_UNSUPPORTED_CODES: ReadonlySet<string> = new Set([
  'EXDEV',
  'EPERM',
  'ENOTSUP',
  'EOPNOTSUPP',
  'ENOSYS',
  'EMLINK',
]);

/**
 * Put a second name or a copy of `source` at `destination` without ever overwriting: `link` fails
 * with EEXIST when something is there, and so does the COPYFILE_EXCL copy used when hard links are
 * not available. Returns whether a hard link (the same file, not a copy) was made.
 */
async function placeInBackup(source: string, destination: string): Promise<boolean> {
  try {
    await link(source, destination);
    return true;
  } catch (err) {
    if (!LINK_UNSUPPORTED_CODES.has((err as NodeJS.ErrnoException).code ?? '')) throw err;
  }
  try {
    await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
  } catch (err) {
    // EEXIST: something appeared at the destination meanwhile; it is not ours to remove.
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') await removeBackupCopy(destination);
    throw err;
  }
  return false;
}

/**
 * Move `source` to `destination` (#1938, #1944). A hard link (or, where links are unsupported, an
 * exclusive copy) is made first, so an existing destination is never overwritten, even by a
 * process that created it a moment ago. The new name must have `expectedHash`, the original is
 * hashed again (a user edit made after that throws a {@link SourceChangedError}), then the original
 * is unlinked. Throws when the file was not moved; the original is then still in place, and a
 * copy or link of ours is removed again. Once the copy is verified, an original that is gone
 * afterwards (whatever the unlink reported) means the copy is the backup: the move counts as done
 * and the copy is kept. When the state of the original cannot be read (not ENOENT/ENOTDIR), the
 * move is treated as failed, the original is kept and a verified copy is left in the backup.
 */
async function moveFile(source: string, destination: string, expectedHash: string): Promise<void> {
  const linked = await placeInBackup(source, destination);
  let copyVerified = false;
  try {
    if ((await computeFileHash(destination)) !== expectedHash) {
      // A hard link shares the original's bytes: a mismatch means the original changed.
      throw linked
        ? new SourceChangedError()
        : new Error('the backup copy does not match the original');
    }
    copyVerified = true;
    if ((await computeFileHash(source)) !== expectedHash) throw new SourceChangedError();
    await unlink(source);
  } catch (err) {
    const original = await presenceOf(source);
    if (copyVerified && original === 'absent') return;
    // Unknown state of a verified copy: keep it rather than risk losing the only copy.
    if (!copyVerified || original === 'present') await removeBackupCopy(destination);
    throw err;
  }
}

/**
 * Whether a move that reported an error happened anyway (#1938 L2): the original is gone and the
 * destination holds the expected content.
 */
async function movedDespiteError(
  source: string,
  destination: string,
  expectedHash: string
): Promise<boolean> {
  if ((await presenceOf(source)) !== 'absent') return false;
  try {
    return (await computeFileHash(destination)) === expectedHash;
  } catch {
    return false;
  }
}

/**
 * Move one file of the project into this run's backup (#1938): create its folders there (never
 * through a symlink), then {@link moveFile}. Throws when the file was not moved. Records the
 * run's backup folder in `result.retiredBackupDir` once the file is in it.
 */
async function moveIntoBackup(
  targetDir: string,
  backup: RetiredBackup,
  result: UpdateResult,
  path: string,
  expectedHash: string
): Promise<string> {
  const source = join(targetDir, path);
  const destination = join(backup.dir, retiredBackupPath(path));
  await prepareBackupDestination(targetDir, destination, backup.created);
  try {
    await moveFile(source, destination, expectedHash);
  } catch (err) {
    if (!(await movedDespiteError(source, destination, expectedHash))) throw err;
  }
  result.retiredBackupDir = backup.dir;
  return destination;
}

/**
 * Record a leftover whose move failed: remove the empty directories this run created in the
 * backup, then keep the file with a warning (its ownership is carried, so the next update tries
 * again), unless it disappeared meanwhile. Returns false (not moved).
 */
async function keepAfterFailedMove(
  backup: RetiredBackup,
  result: UpdateResult,
  path: string,
  source: string,
  err: unknown
): Promise<false> {
  await removeCreatedEmptyDirectories(backup);
  // The file disappeared meanwhile: neither moved nor kept, like a missing file. An unreadable
  // state is not "disappeared": the file is kept.
  if ((await presenceOf(source)) === 'absent') return false;
  const reason =
    err instanceof SourceChangedError
      ? err.message
      : `not moved to the backup: ${errorMessage(err, String(err))}`;
  keepOrphan(result, path, reason);
  return false;
}

/**
 * Move a confirmed candidate into the backup (#1938). The location and the hash are checked again
 * first: the confirmation may have waited on the user, and a file changed meanwhile is kept. A
 * failed move keeps the file with a warning (see {@link keepAfterFailedMove}); a move that
 * reported an error but happened is recorded as moved. Returns whether it was moved.
 */
async function moveOrphanToBackup(
  candidate: OrphanCandidate,
  options: UpdateOptions,
  backup: RetiredBackup,
  result: UpdateResult
): Promise<boolean> {
  const { path } = candidate;
  const source = join(options.targetDir, path);
  try {
    await validateOwnedTarget(options.targetDir, path, true);
    if ((await computeFileHash(source)) !== candidate.diskHash) {
      throw new Error('user-modified file');
    }
  } catch (err) {
    keepOrphanAfterError(result, path, err);
    return false;
  }
  let destination: string;
  try {
    destination = await moveIntoBackup(options.targetDir, backup, result, path, candidate.diskHash);
  } catch (err) {
    return keepAfterFailedMove(backup, result, path, source, err);
  }
  getOrphanRetirement(result).removed.push(path);
  result.removedDeprecatedFiles.push(path);
  info('update.retired_file_moved_to_backup', { path, backup: destination });
  await removeEmptyParentDirectories(options.targetDir, path, candidate.componentRoot);
  return true;
}

/** `confirmOrphanRemoval` answered false. */
const DECLINED_BY_USER = 'declined by user';

/**
 * Ask `options.confirmOrphanRemoval` (when given) about the sorted candidate paths. Returns null
 * when the move may proceed, else the reason to keep them all.
 */
async function orphanRemovalDeclineReason(
  options: UpdateOptions,
  paths: readonly string[],
  context: OrphanRemovalContext
): Promise<string | null> {
  const confirm = options.confirmOrphanRemoval;
  if (!confirm) return null;
  try {
    return (await confirm(paths, context)) ? null : DECLINED_BY_USER;
  } catch (err) {
    return `confirmation failed: ${errorMessage(err, String(err))}`;
  }
}

/** The old lock entry for `path` when it carries a valid sha256 ownership hash, else null. */
function ownedLockEntry(lockfile: Lockfile | null, path: string): LockfileEntry | null {
  const entry = lockfile && Object.hasOwn(lockfile.files, path) ? lockfile.files[path] : null;
  if (
    typeof entry !== 'object' ||
    entry === null ||
    typeof entry.templateHash !== 'string' ||
    !SHA256_HEX.test(entry.templateHash)
  ) {
    return null;
  }
  return entry;
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

/**
 * Load the retired template list (#1935). An unreadable or invalid list returns null with a
 * warning: orphan retirement is then skipped, and ownership is carried forward without it (see
 * {@link collectCarriedOwnership}).
 */
async function loadRetiredList(result: UpdateResult): Promise<RetiredTemplatePathEntry[] | null> {
  try {
    return await loadRetiredTemplatePaths();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.warnings.push(
      `Orphan retirement skipped: cannot read retired template paths: ${message}`
    );
    return null;
  }
}

/**
 * Check every in-scope leftover (see {@link retireOrphanTemplateFiles}) and return the ones that
 * pass every retirement condition; the others are kept and recorded.
 */
async function collectOrphanCandidates(
  options: UpdateOptions,
  entries: readonly RetiredTemplatePathEntry[],
  lockfile: Lockfile | null,
  result: UpdateResult,
  config: OmccConfig,
  customizations: DeletionCustomizations
): Promise<OrphanCandidate[]> {
  const fullUpdate = !options.components || options.components.length === 0;
  const candidates: OrphanCandidate[] = [];
  for (const entry of entries) {
    const component = resolveLockfileComponent(entry.path);
    if (
      RTK_RETIRED_PATHS.has(entry.path) ||
      !isUpdateComponent(component) ||
      !(fullUpdate || options.components?.includes(component))
    ) {
      continue;
    }
    const candidate = await retireOrphanFile(
      entry,
      getComponentPath(component),
      options,
      lockfile,
      result,
      deletionPreservedReason(entry.path, config, customizations)
    );
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

/**
 * Move the confirmed candidates into `backup` and record `backupDir` when at least one was moved.
 * Each failed move removes the empty directories this run created (see `RetiredBackup.created`),
 * so when none was moved no backup directory of this run is left.
 */
async function moveConfirmedOrphans(
  candidates: readonly OrphanCandidate[],
  options: UpdateOptions,
  backup: RetiredBackup,
  result: UpdateResult
): Promise<void> {
  let moved = 0;
  for (const candidate of candidates) {
    if (await moveOrphanToBackup(candidate, options, backup, result)) moved++;
  }
  // A failed move has already removed the empty directories this run created for it.
  if (moved > 0) getOrphanRetirement(result).backupDir = backup.dir;
}

/**
 * Retire leftovers that oh-my-customcode no longer ships (#1935), scoped like the RTK flow:
 * every component on a full update, otherwise only the selected components. RTK paths are
 * excluded here. `entries` is the loaded retired list; null (unreadable list) skips the step.
 *
 * Every leftover is checked first; the files that pass are listed in `wouldRemove` on a dry run
 * (nothing is created), otherwise confirmed once through `options.confirmOrphanRemoval` (#1941)
 * and then moved into this run's backup (#1938, see {@link planRetiredBackup}). When the
 * confirmation declines or fails they are all kept; their lock entries stay carriable, so the
 * next update asks again.
 */
async function retireOrphanTemplateFiles(
  options: UpdateOptions,
  entries: readonly RetiredTemplatePathEntry[] | null,
  lockfile: Lockfile | null,
  result: UpdateResult,
  config: OmccConfig,
  customizations: DeletionCustomizations
): Promise<void> {
  if (entries === null) return;

  const retirement = getOrphanRetirement(result);
  const candidates = await collectOrphanCandidates(
    options,
    entries,
    lockfile,
    result,
    config,
    customizations
  );
  if (candidates.length === 0) return;

  if (options.dryRun) {
    retirement.wouldRemove.push(...candidates.map((candidate) => candidate.path));
    return;
  }
  const paths = candidates.map((candidate) => candidate.path).sort();
  const backup = planRetiredBackup(options.targetDir, result);
  const declineReason = await orphanRemovalDeclineReason(options, paths, { backupDir: backup.dir });
  if (declineReason !== null) {
    const keptBy = declineReason === DECLINED_BY_USER ? 'declined' : undefined;
    for (const path of paths) keepOrphan(result, path, declineReason, keptBy);
    return;
  }
  await moveConfirmedOrphans(candidates, options, backup, result);
}

/** Ownership carried into the regenerated lock, and the leftover paths that were evaluated. */
interface CarriedOwnership {
  /**
   * Entries to keep for paths the old lock owned (see `LockfileWriteOptions.carriedEntries`):
   * the old ownership hash (equal to the disk hash), the disk size and the path's component.
   */
  entries: Record<string, LockfileEntry>;
  /** Paths with an old lock entry that were evaluated, carried or not. */
  evaluated: string[];
}

/**
 * The old lock entry for a leftover, as it should be carried, or null when it must not be:
 * requires a regular file at exactly that location, disk hash == old hash, and (when `shipped`
 * is given) disk hash == a shipped version. The caller has already excluded shipped and RTK
 * paths and entries without a valid ownership hash.
 */
async function carriableEntry(
  targetDir: string,
  path: string,
  oldEntry: LockfileEntry,
  shipped: readonly string[] | null
): Promise<LockfileEntry | null> {
  try {
    await validateOwnedTarget(targetDir, path, true);
    const fullPath = join(targetDir, path);
    const diskHash = await computeFileHash(fullPath);
    if (diskHash !== oldEntry.templateHash) return null;
    if (shipped !== null && !shipped.includes(diskHash)) return null;
    const { size } = await lstat(fullPath);
    return { templateHash: diskHash, size, component: resolveLockfileComponent(path) };
  } catch (err) {
    // Missing (ENOENT/ENOTDIR), not a regular file or escaping (no errno code): not provably
    // owned any more. Any other errno (EIO, ...) leaves the state unknown: keep the old entry.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === undefined || code === 'ENOENT' || code === 'ENOTDIR') return null;
    return oldEntry;
  }
}

/**
 * Old lock entries of leftovers to carry into the regenerated lock, so ownership survives a
 * partial update, a kept leftover or a list that fails to load. Never adds a path the old lock
 * does not have, and never deletes anything. RTK paths are not carried: update deletes them.
 *
 * With the retired list (`entries` non-empty): candidates are the listed paths, and the disk
 * hash must also be one of the listed shipped hashes. Without it (`entries` null — unreadable —
 * or empty, as for a missing list file): candidates are the old lock paths inside a lockfile
 * component that have no template counterpart, without the shipped-hash check, and a warning
 * names how many were carried. That fallback can keep entries the list would not (an unmodified
 * custom file that a legacy lock recorded), which is safe: carrying only keeps a lock entry,
 * and deletion still requires the list. The next update with the list drops them again.
 */
async function collectCarriedOwnership(
  targetDir: string,
  lockfile: Lockfile | null,
  entries: readonly RetiredTemplatePathEntry[] | null,
  result: UpdateResult
): Promise<CarriedOwnership> {
  const carried: CarriedOwnership = { entries: {}, evaluated: [] };
  if (lockfile === null) return carried;

  const withList = entries !== null && entries.length > 0;
  const candidates: Array<[string, readonly string[] | null]> = withList
    ? entries.map((entry) => [entry.path, entry.sha256])
    : Object.keys(lockfile.files)
        .filter((path) => isRetirablePath(path))
        .map((path) => [path, null]);

  for (const [path, shipped] of candidates) {
    const oldEntry = ownedLockEntry(lockfile, path);
    if (!oldEntry || RTK_RETIRED_PATHS.has(path) || (await templatePathExists(path))) continue;
    carried.evaluated.push(path);
    const entry = await carriableEntry(targetDir, path, oldEntry, shipped);
    if (entry) carried.entries[path] = entry;
  }

  const count = Object.keys(carried.entries).length;
  if (!withList && count > 0) {
    result.warnings.push(
      `Lockfile ownership of ${count} file(s) without a template counterpart was carried forward without the retired template list; they are not moved to a backup until the list is available`
    );
  }
  return carried;
}

/**
 * `update()` found no component updates (#1935 follow-up): still retire owned leftovers, so a
 * version bumped by an earlier partial update does not strand them. The lock is not regenerated
 * (that would record user-modified template files as unmodified); instead the evaluated leftover
 * entries that are no longer carriable — moved, modified, missing — and every RTK entry are
 * dropped from the old lock, and it is written only when something was dropped. The retired RTK
 * feature is deleted here too, so doctor's RTK hint holds on an up-to-date project. Dry-run
 * changes nothing; an unreadable list skips the orphans and leaves their ownership alone.
 */
async function retireOrphansWithoutUpdates(
  options: UpdateOptions,
  result: UpdateResult,
  config: OmccConfig
): Promise<void> {
  const lockfile = await readLockfile(options.targetDir);
  const customizations = await loadDeletionCustomizations(options);
  // Same order as a full update: RTK (settings wiring, then files), then the orphans. An
  // unreadable retired list skips only the orphans.
  await retireRtkFiles(options, lockfile, result, config, customizations);
  const entries = await loadRetiredList(result);
  await retireOrphanTemplateFiles(options, entries, lockfile, result, config, customizations);
  if (options.dryRun || lockfile === null) return;

  // RTK entries always leave the lock (ownership no longer matters); orphan ownership is settled
  // only when the retired list loaded.
  const carried =
    entries === null
      ? { entries: {}, evaluated: [] }
      : await collectCarriedOwnership(options.targetDir, lockfile, entries, result);
  const dropped = new Set([
    ...carried.evaluated.filter((path) => !(path in carried.entries)),
    ...Object.keys(lockfile.files).filter(isRtkLockKey),
  ]);
  if (dropped.size === 0) return;

  const files = Object.fromEntries(
    Object.entries(lockfile.files).filter(([path]) => !dropped.has(path))
  );
  try {
    await writeLockfile(options.targetDir, {
      lockfileVersion: LOCKFILE_VERSION,
      generatorVersion: lockfile.generatorVersion,
      generatedAt: new Date().toISOString(),
      templateVersion: lockfile.templateVersion,
      files,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.warnings.push(`Lockfile update failed: ${message}`);
    warn('update.lockfile_failed', { error: message });
  }
}

/** Create initial update result */
function createUpdateResult(): UpdateResult {
  return {
    success: false,
    updatedComponents: [],
    skippedComponents: [],
    preservedFiles: [],
    backedUpPaths: [],
    previousVersion: '',
    newVersion: '',
    warnings: [],
    syncedRootFiles: [],
    removedDeprecatedFiles: [],
    namespaceSynced: [],
  };
}

/** Handle backup if requested */
async function handleBackupIfRequested(
  targetDir: string,
  backup: boolean,
  result: UpdateResult
): Promise<void> {
  if (!backup) return;
  const backupPath = await backupInstallation(targetDir);
  result.backedUpPaths.push(backupPath);
  info('update.backup_created', { path: backupPath });
}

/** Process a single component update */
async function processComponentUpdate(
  targetDir: string,
  component: UpdateComponent,
  updateCheck: UpdateCheckResult,
  customizations: CustomizationManifest | null,
  options: UpdateOptions,
  result: UpdateResult,
  config: OmccConfig,
  lockfile: Lockfile | null
): Promise<void> {
  const componentUpdate = updateCheck.updatableComponents.find((c) => c.name === component);

  if (!componentUpdate && !options.force) {
    result.skippedComponents.push(component);
    return;
  }

  if (options.dryRun) {
    debug('update.dry_run', { component });
    result.updatedComponents.push(component);
    return;
  }

  try {
    const preserved = await updateComponent(
      targetDir,
      component,
      customizations,
      options,
      config,
      lockfile
    );
    result.updatedComponents.push(component);
    result.preservedFiles.push(...preserved);

    if (options.hard) {
      const synced = await applyNamespaceSync(targetDir, component, lockfile);
      result.namespaceSynced.push(...synced);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.warnings.push(`Failed to update ${component}: ${message}`);
    result.skippedComponents.push(component);
  }
}

/** Update all components */
async function updateAllComponents(
  targetDir: string,
  components: UpdateComponent[],
  updateCheck: UpdateCheckResult,
  customizations: CustomizationManifest | null,
  options: UpdateOptions,
  result: UpdateResult,
  config: OmccConfig,
  lockfile: Lockfile | null
): Promise<void> {
  for (const component of components) {
    await processComponentUpdate(
      targetDir,
      component,
      updateCheck,
      customizations,
      options,
      result,
      config,
      lockfile
    );
  }
}

/**
 * Get entry template name based on language
 */
function getEntryTemplateName(language: 'en' | 'ko'): string {
  const layout = getProviderLayout();
  const baseName = layout.entryFile.replace('.md', '');
  return language === 'ko' ? `${baseName}.md.ko` : `${baseName}.md.en`;
}

/**
 * Backup a file before overwriting it
 */
async function backupFile(filePath: string): Promise<void> {
  const fs = await import('node:fs/promises');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup-${timestamp}`;

  if (await fileExists(filePath)) {
    await fs.copyFile(filePath, backupPath);
    debug('update.file_backed_up', { path: filePath, backup: backupPath });
  }
}

/**
 * Resolve manifest customizations based on options
 */
async function resolveManifestCustomizations(
  options: UpdateOptions,
  targetDir: string
): Promise<CustomizationManifest | null> {
  // When forceOverwriteAll is true, skip ALL preservation mechanisms
  if (options.forceOverwriteAll) {
    return null;
  }

  // When preserveCustomizations is false, skip manifest-based preservation
  if (options.preserveCustomizations === false) {
    return null;
  }

  // Load customization manifest
  return loadCustomizationManifest(targetDir);
}

/**
 * Resolve config preserve files based on options
 */
function resolveConfigPreserveFiles(options: UpdateOptions, config: OmccConfig): string[] {
  // When forceOverwriteAll is true, skip config-based preservation
  if (options.forceOverwriteAll) {
    return [];
  }

  const preserveFiles = config.preserveFiles || [];

  // Paths are already validated by mergeConfig (called with targetDir during loadConfig)
  const validatedPaths: string[] = [];
  for (const filePath of preserveFiles) {
    validatedPaths.push(filePath);
  }

  return validatedPaths;
}

/**
 * Resolve customizations from manifest and config
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Security validation adds necessary complexity
export function resolveCustomizations(
  customizations: CustomizationManifest | null,
  configPreserveFiles: string[],
  targetDir: string
): CustomizationManifest | null {
  // Validate manifest preserveFiles
  const validatedManifestFiles: string[] = [];
  if (customizations && customizations.preserveFiles.length > 0) {
    for (const filePath of customizations.preserveFiles) {
      const validation = validatePreserveFilePath(filePath, targetDir);
      if (validation.valid) {
        validatedManifestFiles.push(filePath);
      } else {
        warn('preserve_files.invalid_path', {
          path: filePath,
          reason: validation.reason ?? 'Invalid path',
          source: 'manifest',
        });
      }
    }
  }

  // No preserve files from either source after validation
  if (validatedManifestFiles.length === 0 && configPreserveFiles.length === 0) {
    return customizations && customizations.modifiedFiles.length > 0 ? customizations : null;
  }

  // Merge both sources
  if (validatedManifestFiles.length > 0 && configPreserveFiles.length > 0) {
    const merged = customizations || {
      modifiedFiles: [],
      preserveFiles: [],
      customComponents: [],
      lastUpdated: new Date().toISOString(),
    };
    merged.preserveFiles = [...new Set([...validatedManifestFiles, ...configPreserveFiles])];
    return merged;
  }

  // Only config has preserve files
  if (configPreserveFiles.length > 0) {
    return {
      modifiedFiles: customizations?.modifiedFiles || [],
      preserveFiles: configPreserveFiles,
      customComponents: customizations?.customComponents || [],
      lastUpdated: new Date().toISOString(),
    };
  }

  // Only manifest has preserve files.
  // customizations is guaranteed non-null here: validatedManifestFiles.length > 0
  // only when customizations was truthy in the population loop above.
  // biome-ignore lint/style/noNonNullAssertion: logically guaranteed non-null (see comment)
  customizations!.preserveFiles = validatedManifestFiles;
  return customizations;
}

/**
 * Update entry document with merge support
 */
async function updateEntryDoc(
  targetDir: string,
  config: OmccConfig,
  options: UpdateOptions
): Promise<void> {
  const layout = getProviderLayout();
  const entryPath = join(targetDir, layout.entryFile);
  const templateName = getEntryTemplateName(config.language);
  const templatePath = resolveTemplatePath(templateName);

  if (!(await fileExists(templatePath))) {
    warn('update.entry_template_not_found', { template: templateName });
    return;
  }

  // The template states the shipped skill count; state the deployed one (#1937).
  const templateContent = withDeployedSkillCount(
    await readTextFile(templatePath),
    await countSkillDirectories(join(targetDir, layout.rootDir, 'skills'))
  );

  if (await fileExists(entryPath)) {
    if (options.force) {
      // Force: overwrite with backup
      await backupFile(entryPath);
      await writeTextFile(entryPath, templateContent);
      info('update.entry_doc_force_updated', { path: layout.entryFile });
    } else {
      // Merge: preserve custom sections
      const existingContent = await readTextFile(entryPath);
      const mergeResult = mergeEntryDoc(existingContent, templateContent);

      await writeTextFile(entryPath, mergeResult.content);

      debug('update.entry_doc_merged', {
        path: layout.entryFile,
        managed: String(mergeResult.managedSections),
        custom: String(mergeResult.customSections),
      });

      if (mergeResult.warnings.length > 0) {
        for (const warning of mergeResult.warnings) {
          warn('update.entry_merge_warning', { warning });
        }
      }
    }
  } else {
    // New file: wrap in markers
    await writeTextFile(entryPath, wrapInManagedMarkers(templateContent));
    info('update.entry_doc_created', { path: layout.entryFile });
  }
}

/**
 * Backfill refreshInterval into an existing statusLine config that lacks it.
 * This fixes installations created before refreshInterval was introduced.
 */
async function backfillStatusLineRefreshInterval(
  targetDir: string,
  options: UpdateOptions
): Promise<void> {
  if (options.dryRun) {
    return;
  }

  const layout = getProviderLayout();
  const settingsPath = join(targetDir, layout.rootDir, 'settings.local.json');

  if (!(await fileExists(settingsPath))) {
    return;
  }

  try {
    const existing = await readJsonFile<Record<string, unknown>>(settingsPath);
    if (!existing.statusLine) {
      return;
    }

    const sl = existing.statusLine as Record<string, unknown>;
    if (sl.refreshInterval === undefined) {
      sl.refreshInterval = 10;
      await writeJsonFile(settingsPath, existing);
      debug('update.settings_local_refreshInterval_backfilled', {});
    }
  } catch {
    // Non-blocking: parse failure should not abort the update
    warn('update.settings_local_backfill_failed', {
      path: settingsPath,
    });
  }
}

/**
 * Rewrite cwd-relative omcustom hook commands in settings.local.json to the
 * CLAUDE_PROJECT_DIR-anchored form (#1767).
 *
 * Retire exact RTK commands, then apply the existing command rewrite without regenerating
 * unrelated hook groups. The file is written only when a command changed. The file's
 * trailing-newline convention and leading UTF-8 BOM (if any) are preserved.
 */
async function migrateHookCommandsInSettingsLocal(
  targetDir: string,
  options: UpdateOptions,
  result: UpdateResult,
  rewriteCommands = true
): Promise<void> {
  rtkSettingsHandled.add(result);
  for (const name of ['settings.json', 'settings.local.json']) {
    await migrateRtkSettingsFile(targetDir, options, result, name, rewriteCommands);
  }
}

/**
 * Report hooks that still mention rtk-intercept.sh after the strip, naming event, matcher and the
 * script path only (never the full command, which can hold inline secrets). Hooks running the
 * deleted project script inside a longer command will fail and are warned about every run; a
 * script of that name elsewhere is not deleted, so it is only mentioned on the run that changed
 * the file.
 */
function warnAboutKeptRtkHooks(
  result: UpdateResult,
  path: string,
  mentions: ReturnType<typeof findRtkInterceptMentions>,
  changedFile: boolean
): void {
  const label = (m: (typeof mentions)[number]) => `${m.event}[${m.matcher}] ${m.script}`;
  const failing = mentions.filter((m) => m.projectScript);
  const elsewhere = mentions.filter((m) => !m.projectScript);
  const retirement = getRtkRetirement(result);
  if (failing.length > 0) {
    retirement.settingsConflicts.push(path);
    result.warnings.push(
      `RTK retirement kept ${failing.length} hook(s) in ${path} that run the project script rtk-intercept.sh inside a longer command (${failing.map(label).join(', ')}); they will fail once the script is deleted — edit them yourself`
    );
  }
  if (elsewhere.length > 0 && changedFile) {
    result.warnings.push(
      `RTK retirement kept ${elsewhere.length} hook(s) in ${path} that use an rtk-intercept.sh at another path (${elsewhere.map(label).join(', ')}); that script is not deleted`
    );
  }
}

async function migrateRtkSettingsFile(
  targetDir: string,
  options: UpdateOptions,
  result: UpdateResult,
  name: string,
  rewriteCommands: boolean
): Promise<void> {
  const layout = getProviderLayout();
  const path = `${layout.rootDir}/${name}`;
  const settingsPath = join(targetDir, path);
  const retirement = getRtkRetirement(result);
  try {
    await validateOwnedTarget(targetDir, path);
    const raw = await readTextFile(settingsPath);
    // A leading UTF-8 BOM makes JSON.parse throw; strip it for parsing and restore it on write.
    const bom = raw.startsWith('﻿') ? '﻿' : '';
    const parsed: unknown = JSON.parse(bom ? raw.slice(bom.length) : raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('unknown settings shape');
    }

    const current = parsed as Record<string, unknown>;
    const projectDirs = [...new Set([targetDir, await realpath(targetDir)])];
    const hooks = stripRtkInterceptHooks(current.hooks, projectDirs);
    const retired = hooks !== current.hooks;
    const input = retired ? { ...current, hooks } : current;
    const { settings, rewritten } =
      name === 'settings.local.json' && rewriteCommands
        ? migrateHookCommands(input)
        : { settings: input, rewritten: 0 };
    warnAboutKeptRtkHooks(
      result,
      path,
      findRtkInterceptMentions(settings.hooks, projectDirs),
      retired
    );
    if (!retired && rewritten === 0) {
      return;
    }

    if (options.dryRun) {
      retirement.wouldChangeSettings.push(path);
      return;
    }

    const trailingNewline = raw.endsWith('\n') ? '\n' : '';
    await validateOwnedTarget(targetDir, path);
    await writeTextFile(
      settingsPath,
      `${bom}${JSON.stringify(settings, null, 2)}${trailingNewline}`
    );
    retirement.settingsChanged.push(path);
    info('update.hook_commands_migrated', { count: String(rewritten) });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    retirement.settingsConflicts.push(path);
    result.warnings.push(
      `RTK retirement could not safely migrate ${path}; its RTK files are deleted anyway`
    );
    // Non-blocking: parse/read/write failure should not abort the update
    warn('update.hook_commands_migration_failed', {
      path: settingsPath,
    });
  }
}

/**
 * Handle full-update-only post-processing steps and log success
 */
async function runFullUpdatePostProcessing(
  options: UpdateOptions,
  result: UpdateResult,
  config: OmccConfig,
  customizations: CustomizationManifest | null
): Promise<void> {
  const isFullUpdate = !options.components || options.components.length === 0;

  if (isFullUpdate) {
    const { synced, preserved } = await syncRootLevelFiles(
      options.targetDir,
      options,
      customizations
    );
    result.syncedRootFiles = synced;
    result.preservedFiles.push(...preserved);

    const removed = await removeDeprecatedFiles(options.targetDir, options, result, config);
    result.removedDeprecatedFiles = removed;

    if (!options.dryRun) {
      await updateEntryDoc(options.targetDir, config, options);
      await backfillStatusLineRefreshInterval(options.targetDir, options);
    }
  }

  // The hooks component copies a new-form hooks.json, but CC reads the installed
  // settings.local.json, so migrate it on full updates and hooks-component updates (#1767).
  if (isFullUpdate || options.components?.includes('hooks')) {
    await migrateHookCommandsInSettingsLocal(options.targetDir, options, result);
  }

  if (!options.dryRun) {
    config.version = result.newVersion;
    config.lastUpdated = new Date().toISOString();
    await saveConfig(options.targetDir, config);
  }

  result.success = true;

  if (result.previousVersion !== result.newVersion) {
    success('update.success', { from: result.previousVersion, to: result.newVersion });
  } else if (result.updatedComponents.length > 0) {
    success('update.components_synced', {
      version: result.newVersion,
      components: result.updatedComponents.join(', '),
    });
  }
}

/**
 * Keep the ordinary downgrade comparison, allowing correction of 2.0.0 only to a stable
 * 1.1 patch from 107 onward, with an existing manifest matching this CLI.
 * This checks release versions, not the contents of every template file.
 */
async function getUpdateVersionDecision(
  installedVersion: string,
  cliVersion: string
): Promise<'standard' | 'blocked' | 'correction'> {
  if (!(installedVersion !== '0.0.0' && compareSemver(installedVersion, cliVersion) > 0)) {
    return 'standard';
  }

  if (installedVersion !== '2.0.0') {
    return 'blocked';
  }

  const match = /^1\.1\.(0|[1-9]\d*)$/.exec(cliVersion);
  if (!match) {
    return 'blocked';
  }

  const patch = Number(match[1]);
  if (!Number.isSafeInteger(patch) || patch < 107) {
    return 'blocked';
  }

  const manifestPath = resolveTemplatePath(getProviderLayout().manifestFile);
  if (!(await fileExists(manifestPath))) {
    return 'blocked';
  }

  const manifest = await readJsonFile<unknown>(manifestPath);
  const correctionAllowed =
    typeof manifest === 'object' &&
    manifest !== null &&
    !Array.isArray(manifest) &&
    'version' in manifest &&
    manifest.version === cliVersion;
  return correctionAllowed ? 'correction' : 'blocked';
}

/**
 * Compare two semver strings numerically.
 * Returns a positive number if a > b, negative if a < b, 0 if equal.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Update the project registry with the new version after a successful update.
 * Non-blocking — registry update is informational only.
 */
async function updateProjectRegistry(targetDir: string, newVersion: string): Promise<void> {
  try {
    const { registerProject } = await import('./registry.js');
    await registerProject(targetDir, newVersion);
  } catch {
    // Registry update is informational only — never block the update result
  }
}

/**
 * Regenerate and log the lockfile result after a successful update.
 * Extracted to reduce cognitive complexity of update().
 */
async function regenerateLockfile(
  options: UpdateOptions,
  result: UpdateResult,
  retiredPaths: readonly string[],
  carriedEntries: Readonly<Record<string, LockfileEntry>>
): Promise<void> {
  if (options.dryRun) return;
  const lockfileResult = await generateAndWriteLockfileForDir(options.targetDir, {
    retiredPaths,
    carriedEntries,
  });
  if (lockfileResult.warning) {
    result.warnings.push(lockfileResult.warning);
    warn('update.lockfile_failed', { error: lockfileResult.warning });
  } else {
    debug('update.lockfile_regenerated', {
      files: String(lockfileResult.fileCount),
    });
  }
}

/**
 * After the component updates: move retired RTK files and leftovers that are no longer
 * shipped into this run's backup (#1935, #1938, #1939), then regenerate the lockfile (#316), keeping
 * ownership of leftovers that were not moved so a later update can still move them. Both honour
 * every preservation source, even with forceOverwriteAll (overwrite ≠ delete or move).
 */
async function retireLeftoversAndRegenerateLockfile(
  options: UpdateOptions,
  lockfile: Lockfile | null,
  result: UpdateResult,
  config: OmccConfig
): Promise<void> {
  const deletionCustomizations = await loadDeletionCustomizations(options);
  const retiredPaths = await retireRtkFiles(
    options,
    lockfile,
    result,
    config,
    deletionCustomizations
  );
  const retiredList = await loadRetiredList(result);
  await retireOrphanTemplateFiles(
    options,
    retiredList,
    lockfile,
    result,
    config,
    deletionCustomizations
  );
  if (options.dryRun) return;
  const carried = await collectCarriedOwnership(options.targetDir, lockfile, retiredList, result);
  await regenerateLockfile(options, result, retiredPaths, carried.entries);
}

/**
 * Guard against updating the oh-my-customcode source project itself.
 * Returns true if the update should be skipped.
 */
async function shouldSkipSelfUpdate(targetDir: string, result: UpdateResult): Promise<boolean> {
  const targetPkgPath = join(targetDir, 'package.json');
  if (await fileExists(targetPkgPath)) {
    const targetPkg = await readJsonFile<{ name?: string }>(targetPkgPath);
    if (targetPkg.name === 'oh-my-customcode') {
      warn('update.self_update_skipped');
      result.success = true;
      result.skippedSource = true;
      result.warnings.push('Skipped: source project cannot update itself');
      return true;
    }
  }
  return false;
}

/**
 * Check if Codex CLI is installed after an update and install it if missing
 */
function checkAndInstallCodexAfterUpdate(): void {
  if (!isCodexInstalled()) {
    warn('update.codex_missing');
    console.log(i18n.t('cli.update.codexMissing'));
    const codexInstalled = installCodex();
    if (codexInstalled) {
      console.log(i18n.t('cli.update.codexInstalled'));
    }
  }
}

/**
 * Update oh-my-customcode installation
 */
export async function update(options: UpdateOptions): Promise<UpdateResult> {
  const result = createUpdateResult();

  try {
    info('update.start', { targetDir: options.targetDir });

    const config = await loadConfig(options.targetDir);
    result.previousVersion = config.version;

    // Guard against version downgrade (#579), except for the narrowly checked
    // correction of the accidentally published 2.0.0 release.
    const cliVersion = packageJson.version as string;
    const versionDecision = await getUpdateVersionDecision(result.previousVersion, cliVersion);
    if (versionDecision === 'blocked') {
      result.success = false;
      result.error = `Downgrade prevented: project has v${result.previousVersion} but CLI is v${cliVersion}. Update the CLI first: npm install -g oh-my-customcode@latest`;
      return result;
    }

    if (await shouldSkipSelfUpdate(options.targetDir, result)) {
      return result;
    }

    const updateCheck = await checkForUpdates(options.targetDir);
    // Recheck the selected template version before backups or update writes.
    if (versionDecision === 'correction' && updateCheck.latestVersion !== cliVersion) {
      result.success = false;
      result.error = `Version correction prevented: CLI is v${cliVersion} but templates are v${updateCheck.latestVersion}. Reinstall the CLI: npm install -g oh-my-customcode@latest`;
      return result;
    }
    result.newVersion = updateCheck.latestVersion;

    if (!updateCheck.hasUpdates && !options.force) {
      info('update.no_updates');
      result.skippedComponents = options.components || getAllUpdateComponents();
      await retireOrphansWithoutUpdates(options, result, config);
      await ensureBackupGitignore(options.targetDir, { dryRun: options.dryRun });
      result.success = true;
      return result;
    }

    await handleBackupIfRequested(options.targetDir, !!options.backup && !options.dryRun, result);

    // Load preservation config from BOTH sources
    const manifestCustomizations = await resolveManifestCustomizations(options, options.targetDir);
    const configPreserveFiles = resolveConfigPreserveFiles(options, config);
    const customizations = resolveCustomizations(
      manifestCustomizations,
      configPreserveFiles,
      options.targetDir
    );

    // Read lockfile for smart protected file handling
    const lockfile = await readLockfile(options.targetDir);

    // Update all components
    const components = options.components || getAllUpdateComponents();
    await updateAllComponents(
      options.targetDir,
      components,
      updateCheck,
      customizations,
      options,
      result,
      config,
      lockfile
    );

    await runFullUpdatePostProcessing(options, result, config, customizations);

    await retireLeftoversAndRegenerateLockfile(options, lockfile, result, config);

    // After every backup of this run (the --backup copy and the retired-file backup) exists
    await ensureBackupGitignore(options.targetDir, { dryRun: options.dryRun });

    // Check Codex CLI after update
    if (!options.dryRun) checkAndInstallCodexAfterUpdate();

    // Update project registry with new version (non-blocking)
    if (result.success && !options.dryRun) {
      await updateProjectRegistry(options.targetDir, result.newVersion);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    error('update.failed', { error: message });
  }

  return result;
}

/**
 * Check for available updates
 */
export async function checkForUpdates(targetDir: string): Promise<UpdateCheckResult> {
  const config = await loadConfig(targetDir);
  const currentVersion = config.version;

  // Get latest version from templates
  const latestVersion = await getLatestVersion();

  // Check each component for updates
  const updatableComponents: UpdateCheckResult['updatableComponents'] = [];

  for (const component of getAllUpdateComponents()) {
    const hasUpdate = await componentHasUpdate(targetDir, component, config);
    if (hasUpdate) {
      updatableComponents.push({
        name: component,
        currentVersion: config.componentVersions?.[component] || '0.0.0',
        latestVersion,
      });
    }
  }

  return {
    hasUpdates: updatableComponents.length > 0 || currentVersion !== latestVersion,
    currentVersion,
    latestVersion,
    updatableComponents,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Apply updates to specific files
 */
export async function applyUpdates(
  targetDir: string,
  updates: { path: string; content: string }[]
): Promise<void> {
  const fs = await import('node:fs/promises');

  for (const update of updates) {
    const fullPath = join(targetDir, update.path);
    await ensureDirectory(join(fullPath, '..'));
    await fs.writeFile(fullPath, update.content, 'utf-8');
    debug('update.file_applied', { path: update.path });
  }
}

/**
 * Preserve user customizations during update
 */
export async function preserveCustomizations(
  targetDir: string,
  customizations: string[]
): Promise<Map<string, string>> {
  const preserved = new Map<string, string>();
  const fs = await import('node:fs/promises');

  for (const filePath of customizations) {
    const fullPath = join(targetDir, filePath);
    if (await fileExists(fullPath)) {
      const content = await fs.readFile(fullPath, 'utf-8');
      preserved.set(filePath, content);
    }
  }

  return preserved;
}

/**
 * Get all update components
 */
function getAllUpdateComponents(): UpdateComponent[] {
  return ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts', 'ontology'];
}

/**
 * Get the latest version from package templates
 */
async function getLatestVersion(): Promise<string> {
  const layout = getProviderLayout();
  const manifestPath = resolveTemplatePath(layout.manifestFile);
  if (await fileExists(manifestPath)) {
    const manifest = await readJsonFile<{ version: string }>(manifestPath);
    return manifest.version;
  }
  return '0.0.0';
}

/**
 * Check if a component has updates available
 */
async function componentHasUpdate(
  _targetDir: string,
  component: UpdateComponent,
  config: OmccConfig
): Promise<boolean> {
  const installedVersion = config.componentVersions?.[component];
  if (!installedVersion) {
    return true; // Not installed, so update available
  }

  // Simple version comparison (could be enhanced with semver)
  const latestVersion = await getLatestVersion();
  return installedVersion !== latestVersion;
}

/**
 * Determine if a protected file should be skipped during update.
 * Uses lockfile hash comparison to detect user modifications.
 * Unmodified protected files are safe to update from templates.
 *
 * Decision table:
 *   - No lockfile            → legacy install, can't verify → preserve (safe default)
 *   - File not in lockfile   → new template file → allow update
 *   - Target file missing    → allow update
 *   - Hash matches lockfile  → file unmodified by user → allow update
 *   - Hash differs           → user modified the file → preserve
 */
async function shouldSkipProtectedFile(
  targetFilePath: string,
  lockfileKey: string,
  lockfile: Lockfile | null
): Promise<boolean> {
  // No lockfile → legacy install, can't verify → preserve (safe default)
  if (!lockfile) {
    return true;
  }

  const lockfileEntry = lockfile.files[lockfileKey];

  // File not in lockfile → new template file → allow update
  if (!lockfileEntry) {
    return false;
  }

  // Target file doesn't exist → allow update
  if (!(await fileExists(targetFilePath))) {
    return false;
  }

  // Compare target file hash with lockfile hash
  try {
    const currentHash = await computeFileHash(targetFilePath);
    // Hash matches → file is unmodified by user → safe to update
    // Hash differs → user modified the file → preserve
    return currentHash !== lockfileEntry.templateHash;
  } catch {
    // If hash computation fails, preserve (safe default)
    return true;
  }
}

/**
 * Collect the protected file paths within a component's source directory.
 * Uses lockfile to distinguish user-modified files (skip) from unmodified ones (update).
 * Returns paths normalized relative to destPath for use with skipPaths.
 */
async function collectProtectedSkipPaths(
  srcPath: string,
  destPath: string,
  componentPath: string,
  forceOverwriteAll: boolean,
  lockfile: Lockfile | null,
  targetDir: string
): Promise<{ skipPaths: string[]; warnedPaths: string[]; updatedPaths: string[] }> {
  if (forceOverwriteAll) {
    // forceOverwriteAll: still warn but do NOT skip
    const warnedPaths = await findProtectedFilesInDir(srcPath, componentPath);
    return { skipPaths: [], warnedPaths, updatedPaths: [] };
  }

  const protectedRelative = await findProtectedFilesInDir(srcPath, componentPath);
  const path = await import('node:path');

  const skipPaths: string[] = [];
  const warnedPaths: string[] = [];
  const updatedPaths: string[] = [];

  for (const p of protectedRelative) {
    const targetFilePath = join(targetDir, componentPath, p);
    // Lockfile keys use forward-slash paths like ".claude/rules/MUST-safety.md"
    const lockfileKey = `${componentPath}/${p}`.replace(/\\/g, '/');

    const shouldSkip = await shouldSkipProtectedFile(targetFilePath, lockfileKey, lockfile);

    if (shouldSkip) {
      skipPaths.push(path.relative(destPath, join(destPath, p)));
      warnedPaths.push(p);
    } else {
      updatedPaths.push(p);
    }
  }

  return { skipPaths, warnedPaths, updatedPaths };
}

/**
 * Check if a directory entry's relative path matches a protected-file rule,
 * considering both the bare relative path and the component-prefixed path.
 */
function isEntryProtected(relPath: string, componentRelativePrefix: string): boolean {
  if (isProtectedFile(relPath)) {
    return true;
  }
  const componentPrefixed = componentRelativePrefix
    ? `${componentRelativePrefix}/${relPath}`
    : relPath;
  return isProtectedFile(componentPrefixed);
}

/**
 * Read directory entries, returning an empty array on error (e.g. directory not found).
 */
async function safeReaddir(
  dir: string,
  fs: typeof import('node:fs/promises')
): Promise<import('node:fs').Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Walk a component source directory and return paths (relative to the component root)
 * of any files that match the protected-file rules.
 */
async function findProtectedFilesInDir(
  dirPath: string,
  componentRelativePrefix: string
): Promise<string[]> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  // Iterative BFS walk to avoid recursive async function complexity
  const protected_: string[] = [];
  const queue: Array<{ dir: string; relDir: string }> = [{ dir: dirPath, relDir: '' }];

  while (queue.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: queue.length > 0 guarantees shift() returns a value
    const { dir, relDir } = queue.shift()!;
    const entries = await safeReaddir(dir, fs);

    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        queue.push({ dir: fullPath, relDir: relPath });
      } else if (entry.isFile() && isEntryProtected(relPath, componentRelativePrefix)) {
        protected_.push(relPath);
      }
    }
  }

  return protected_;
}

/**
 * Update a single component
 */
async function updateComponent(
  targetDir: string,
  component: UpdateComponent,
  customizations: CustomizationManifest | null,
  options: UpdateOptions,
  config: OmccConfig,
  lockfile: Lockfile | null
): Promise<string[]> {
  const preservedFiles: string[] = [];
  const componentPath = getComponentPath(component);
  const srcPath = resolveTemplatePath(componentPath);
  const destPath = join(targetDir, componentPath);

  // Use provided config to check for managed:false components
  const customComponents = config.customComponents || [];

  // Build skipPaths list from preserved files and custom components
  const skipPaths: string[] = [];

  // Add preserved files to skipPaths
  // Skip preservation only if forceOverwriteAll is true
  // Note: preserveCustomizations flag is already handled in update() function
  // when building the customizations object
  if (customizations && !options.forceOverwriteAll) {
    const toPreserve = customizations.preserveFiles.filter((f) => f.startsWith(componentPath));
    preservedFiles.push(...toPreserve);
    skipPaths.push(...toPreserve);
  }

  // Add custom components in this component path to skipPaths
  for (const cc of customComponents) {
    if (cc.path.startsWith(componentPath)) {
      skipPaths.push(cc.path);
    }
  }

  // Collect protected framework/rule files that must not be silently overwritten.
  // Uses lockfile to distinguish user-modified files (skip) from unmodified ones (update).
  const {
    skipPaths: protectedSkipPaths,
    warnedPaths: protectedWarnedPaths,
    updatedPaths: protectedUpdatedPaths,
  } = await collectProtectedSkipPaths(
    srcPath,
    destPath,
    componentPath,
    !!options.forceOverwriteAll,
    lockfile,
    targetDir
  );

  for (const protectedPath of protectedWarnedPaths) {
    if (options.forceOverwriteAll) {
      warn('update.protected_file_force_overwrite', {
        file: protectedPath,
        component,
      });
    } else {
      warn('update.protected_file_skipped', {
        file: protectedPath,
        component,
      });
    }
  }

  // Log protected files selected for update by the protection policy.
  for (const updatedPath of protectedUpdatedPaths) {
    info('update.protected_file_updated', {
      file: updatedPath,
      component,
    });
  }

  // Merge protected skip paths with the existing skip paths (dedup)
  skipPaths.push(...protectedSkipPaths);

  // Normalize skipPaths to be relative to destPath
  const path = await import('node:path');
  const normalizedSkipPaths = skipPaths.map((p) => path.relative(destPath, join(targetDir, p)));

  // Deduplicate after normalization
  const uniqueSkipPaths = [...new Set(normalizedSkipPaths)];

  // Same scope rule as init: a package-scope skill the project does not have is not installed
  // (#1937). Added after normalization because path.relative drops the trailing '/' that marks
  // a directory skip.
  if (component === 'skills') {
    for (const name of await listSkippedPackageSkills(srcPath, destPath)) {
      uniqueSkipPaths.push(`${name}/`);
    }
  }

  // Update component with skipPaths
  await copyDirectory(srcPath, destPath, {
    overwrite: true,
    skipPaths: uniqueSkipPaths.length > 0 ? uniqueSkipPaths : undefined,
  });

  debug('update.component_updated', {
    component,
    skippedPaths: String(uniqueSkipPaths.length),
    protectedSkipped: String(protectedSkipPaths.length),
  });
  return preservedFiles;
}

/**
 * Root-level files in .claude/ that should be synced during update
 * Most live directly under templates/.claude/; entries may also be relative subpaths
 * (e.g. schemas/tool-inputs.json) — the parent directory is created on copy.
 */
const ROOT_LEVEL_FILES = [
  'statusline.sh',
  'install-hooks.sh',
  'uninstall-hooks.sh',
  'schemas/tool-inputs.json',
];

/**
 * Sync root-level files from templates/.claude/ to target .claude/ directory
 * These files don't belong to any component subdirectory.
 *
 * Honors preserveFiles (config + manifest, already merged into `customizations`) with the same
 * semantics as updateComponent: entries are relative to the target dir (e.g.
 * ".claude/schemas/tool-inputs.json") and are ignored when forceOverwriteAll is set.
 * Lockfile-based "user modified" protection is intentionally not applied — like updateComponent,
 * it is limited to protected framework/rule files (isProtectedFile), which root files are not.
 */
async function syncRootLevelFiles(
  targetDir: string,
  options: UpdateOptions,
  customizations: CustomizationManifest | null
): Promise<{ synced: string[]; preserved: string[] }> {
  if (options.dryRun) {
    return { synced: ROOT_LEVEL_FILES, preserved: [] };
  }

  const fs = await import('node:fs/promises');
  const layout = getProviderLayout();
  const synced: string[] = [];
  const preserved: string[] = [];
  const preserveSet = new Set(
    customizations && !options.forceOverwriteAll ? customizations.preserveFiles : []
  );

  for (const fileName of ROOT_LEVEL_FILES) {
    const srcPath = resolveTemplatePath(join(layout.rootDir, fileName));

    if (!(await fileExists(srcPath))) {
      continue;
    }

    const relPath = `${layout.rootDir}/${fileName}`;
    if (preserveSet.has(relPath)) {
      preserved.push(relPath);
      continue;
    }

    const destPath = join(targetDir, layout.rootDir, fileName);
    await ensureDirectory(join(destPath, '..'));
    await fs.copyFile(srcPath, destPath);

    // Preserve execute permissions for shell scripts
    if (fileName.endsWith('.sh')) {
      await fs.chmod(destPath, 0o755);
    }

    synced.push(fileName);
  }

  if (synced.length > 0) {
    debug('update.root_files_synced', { files: synced.join(', ') });
  }

  return { synced, preserved };
}

/**
 * Deprecated file entry in the manifest
 */
interface DeprecatedFileEntry {
  /** Relative path to the deprecated file */
  path: string;
  /** Reason for deprecation */
  reason: string;
  /** Version since which the file was deprecated */
  since: string;
}

/**
 * Deprecated files manifest
 */
interface DeprecatedFilesManifest {
  description: string;
  files: DeprecatedFileEntry[];
}

/**
 * Retire the files listed in templates/deprecated-files.json: each existing regular file is moved
 * into this run's backup (#1939 A2; formerly deleted). Preserved entries, anything else at the
 * path (a symlink, a directory) and any failed move are kept. Returns the moved paths.
 */
async function removeDeprecatedFiles(
  targetDir: string,
  options: UpdateOptions,
  result: UpdateResult,
  config: OmccConfig
): Promise<string[]> {
  const manifestPath = resolveTemplatePath('deprecated-files.json');

  if (!(await fileExists(manifestPath))) {
    return [];
  }

  const manifest = await readJsonFile<DeprecatedFilesManifest>(manifestPath);

  if (!manifest.files || manifest.files.length === 0) {
    return [];
  }

  const removed: string[] = [];
  const customizations = await loadDeletionCustomizations(options);

  for (const entry of manifest.files) {
    if (await retireDeprecatedEntry(entry, targetDir, options, result, config, customizations)) {
      removed.push(entry.path);
    }
  }

  if (removed.length > 0 && !options.dryRun) {
    debug('update.deprecated_files_cleaned', { count: String(removed.length) });
  }

  return removed;
}

/**
 * Move (or, in dry-run, only check) one deprecated entry. Dry-run lists exactly what a real run
 * would move: preserved, absent and unsafe entries are left out of both.
 */
async function retireDeprecatedEntry(
  entry: DeprecatedFileEntry,
  targetDir: string,
  options: UpdateOptions,
  result: UpdateResult,
  config: OmccConfig,
  customizations: DeletionCustomizations
): Promise<boolean> {
  // Security: validate path is within targetDir
  const validation = validatePreserveFilePath(entry.path, targetDir);
  if (!validation.valid) {
    warn('update.deprecated_file_invalid_path', {
      path: entry.path,
      reason: validation.reason ?? 'Invalid path',
    });
    return false;
  }
  if (keepPreservedDeprecated(entry.path, config, customizations, result)) return false;
  if (options.dryRun) {
    return validateOwnedTarget(targetDir, entry.path, true).then(
      () => true,
      () => false
    );
  }
  const destination = await moveDeprecatedFile(targetDir, entry.path, result);
  if (destination === null) return false;
  info('update.deprecated_file_moved_to_backup', {
    path: entry.path,
    reason: entry.reason,
    backup: destination,
  });
  return true;
}

/**
 * Whether a deprecated entry stays because of preserve settings, like orphan leftovers: a
 * deliberate keep is quiet, an unreadable customization manifest is warned about.
 */
function keepPreservedDeprecated(
  path: string,
  config: OmccConfig,
  customizations: DeletionCustomizations,
  result: UpdateResult
): boolean {
  const reason = deletionPreservedReason(path, config, customizations);
  if (reason === null) return false;
  if (reason !== EXPLICITLY_PRESERVED)
    result.warnings.push(`Deprecated file kept ${path}: ${reason}`);
  return true;
}

/**
 * Move one deprecated file into the run's backup. Returns its backup path, or null when it is
 * absent or kept (with a warning). The file must be a regular file at exactly its location
 * (no symlinked directory on the way), like orphan leftovers.
 */
async function moveDeprecatedFile(
  targetDir: string,
  path: string,
  result: UpdateResult
): Promise<string | null> {
  const backup = planRetiredBackup(targetDir, result);
  try {
    await validateOwnedTarget(targetDir, path, true);
    return await moveIntoBackup(
      targetDir,
      backup,
      result,
      path,
      await computeFileHash(join(targetDir, path))
    );
  } catch (err) {
    await removeCreatedEmptyDirectories(backup);
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    result.warnings.push(`Deprecated file kept ${path}: ${errorMessage(err, String(err))}`);
    return null;
  }
}

/**
 * Extract the `name:` field from YAML frontmatter.
 * Returns null if no frontmatter or no name field found.
 */
export function extractFrontmatterName(content: string): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const nameMatch = match[1].match(/^name:\s*(.+)$/m);
  if (!nameMatch) return null;
  return nameMatch[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Sync the frontmatter name: field from upstream to target file.
 * Only modifies the name: line, preserving all other content.
 * Returns true if the file was modified.
 */
async function syncNamespaceInFile(
  targetFilePath: string,
  upstreamFilePath: string
): Promise<boolean> {
  const targetContent = await readTextFile(targetFilePath);
  const upstreamContent = await readTextFile(upstreamFilePath);

  const upstreamName = extractFrontmatterName(upstreamContent);
  const targetName = extractFrontmatterName(targetContent);

  if (!upstreamName || !targetName || upstreamName === targetName) return false;

  // Replace only the name: line in frontmatter
  // Escape $ in upstream name to prevent replace() special patterns ($1, $&, etc.)
  const safeUpstreamName = upstreamName.replace(/\$/g, '$$$$');
  const updated = targetContent.replace(/^(name:\s*).+$/m, `$1${safeUpstreamName}`);

  if (updated === targetContent) return false;

  await writeTextFile(targetFilePath, updated);
  return true;
}

/**
 * Process a single file entry during namespace sync walk.
 * Returns the synced path string if the name was updated, null otherwise.
 */
async function processNamespaceSyncEntry(
  entry: import('node:fs').Dirent,
  relPath: string,
  fullSrcPath: string,
  destPath: string,
  componentPath: string,
  lockfile: Lockfile
): Promise<string | null> {
  if (!entry.isFile() || !entry.name.endsWith('.md')) return null;

  const targetFilePath = join(destPath, relPath);
  const lockfileKey = `${componentPath}/${relPath}`.replace(/\\/g, '/');

  // Only sync unmodified files (hash matches lockfile → safe)
  const shouldSkip = await shouldSkipProtectedFile(targetFilePath, lockfileKey, lockfile);
  if (shouldSkip) return null;

  if (!(await fileExists(targetFilePath))) return null;

  const didSync = await syncNamespaceInFile(targetFilePath, fullSrcPath);
  return didSync ? `${componentPath}/${relPath}` : null;
}

/**
 * Apply namespace synchronization to all unmodified files in a component.
 * Uses lockfile hash comparison to identify unmodified files.
 */
async function applyNamespaceSync(
  targetDir: string,
  component: UpdateComponent,
  lockfile: Lockfile | null
): Promise<string[]> {
  // Without a lockfile we cannot verify which files are unmodified — skip entirely
  if (!lockfile) return [];

  const componentPath = getComponentPath(component);
  const srcPath = resolveTemplatePath(componentPath);
  const destPath = join(targetDir, componentPath);

  const fs = await import('node:fs/promises');
  const synced: string[] = [];

  // BFS walk of the source directory to find .md files with frontmatter
  const queue: Array<{ dir: string; relDir: string }> = [{ dir: srcPath, relDir: '' }];

  while (queue.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: queue.length > 0 guarantees shift() returns a value
    const { dir, relDir } = queue.shift()!;

    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const fullSrcPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        queue.push({ dir: fullSrcPath, relDir: relPath });
        continue;
      }

      const syncedPath = await processNamespaceSyncEntry(
        entry,
        relPath,
        fullSrcPath,
        destPath,
        componentPath,
        lockfile
      );

      if (syncedPath) {
        synced.push(syncedPath);
        info('update.namespace_synced', { file: relPath, component });
      }
    }
  }

  return synced;
}

/**
 * Get the path for a component
 */
function getComponentPath(component: UpdateComponent): string {
  const layout = getProviderLayout();
  if (component === 'guides') {
    return 'guides';
  }
  return `${layout.rootDir}/${component}`;
}

/**
 * Backup the current installation
 */
async function backupInstallation(targetDir: string): Promise<string> {
  const backupDir = join(targetDir, `.omcustom-backup-${backupTimestamp()}`);
  const fs = await import('node:fs/promises');

  await ensureDirectory(backupDir);

  // Stored under backupEntryName so nothing in the backup loads as active configuration (#1943)
  const layout = getProviderLayout();
  const backedUp: string[] = [];
  const dirsToBackup = [layout.rootDir, 'guides'];
  for (const dir of dirsToBackup) {
    const srcPath = join(targetDir, dir);
    if (await fileExists(srcPath)) {
      const destPath = join(backupDir, backupEntryName(dir));
      await copyDirectory(srcPath, destPath, { overwrite: true });
      backedUp.push(dir);
    }
  }

  // Backup entry doc
  const entryPath = join(targetDir, layout.entryFile);
  if (await fileExists(entryPath)) {
    await fs.copyFile(entryPath, join(backupDir, backupEntryName(layout.entryFile)));
    backedUp.push(layout.entryFile);
  }

  // Instruction files deeper in the copied trees load from nested directories too
  const nested = await renameNestedInstructionFilesDetailed(backupDir);
  logBackupRestoreHint(backupDir, backedUp, nested.renamed, nested.collided);
  return backupDir;
}

/**
 * Load customization manifest
 */
export async function loadCustomizationManifest(
  targetDir: string
): Promise<CustomizationManifest | null> {
  const manifestPath = join(targetDir, CUSTOMIZATION_MANIFEST_FILE);
  if (await fileExists(manifestPath)) {
    return readJsonFile<CustomizationManifest>(manifestPath);
  }
  return null;
}

/**
 * Save customization manifest
 */
export async function saveCustomizationManifest(
  targetDir: string,
  manifest: CustomizationManifest
): Promise<void> {
  const manifestPath = join(targetDir, CUSTOMIZATION_MANIFEST_FILE);
  await writeJsonFile(manifestPath, manifest);
}

/**
 * Get list of agent versions
 */
export async function getAgentVersions(targetDir: string): Promise<AgentVersion[]> {
  const config = await loadConfig(targetDir);
  const versions: AgentVersion[] = [];

  if (config.agents) {
    for (const [name, agentConfig] of Object.entries(config.agents)) {
      versions.push({
        name,
        version: agentConfig.version,
        source: agentConfig.source || 'local',
        lastUpdated: agentConfig.lastUpdated || '',
        hasLocalModifications: agentConfig.hasLocalModifications || false,
      });
    }
  }

  return versions;
}
