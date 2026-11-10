/**
 * omcustom update command
 * Updates agents to the latest version
 *
 * Supports three modes:
 * 1. Single-project update (default): updates current directory
 * 2. --all flag: batch update all outdated projects found by project discovery
 * 3. Interactive (TTY, no --all): checkbox UI to select which projects to update
 */

import { constants as osConstants } from 'node:os';
import { createInterface } from 'node:readline/promises';

import packageJson from '../../package.json';
import { checkSelfUpdate, executeSelfUpdate } from '../core/self-update.js';
import {
  type OrphanRemovalConfirmation,
  type UpdateComponent,
  type UpdateOptions,
  update,
} from '../core/updater.js';
import { i18n } from '../i18n/index.js';

/**
 * CLI options for the update command
 */
export interface UpdateCommandOptions {
  /** Show what would be updated without making changes */
  dryRun?: boolean;
  /** Force update even if already at latest version */
  force?: boolean;
  /** Bypass ALL file preservation (manifest and config) */
  forceOverwriteAll?: boolean;
  /** Create backup before updating */
  backup?: boolean;
  /** Update only agents */
  agents?: boolean;
  /** Update only skills */
  skills?: boolean;
  /** Update only rules */
  rules?: boolean;
  /** Update only guides */
  guides?: boolean;
  /** Update only hooks */
  hooks?: boolean;
  /** Update only contexts */
  contexts?: boolean;
  /** Sync frontmatter name: field from upstream in unmodified files */
  hard?: boolean;
  /** Batch update all outdated projects found by project discovery */
  all?: boolean;
  /** Skip self-update of oh-my-customcode package */
  skipSelf?: boolean;
  /** Move retired template files to a backup without asking for confirmation (#1941, #1938) */
  yes?: boolean;
}

/**
 * Whether a CI variable marks a CI run: set and not empty, `false` or `0` (case-insensitive,
 * surrounding spaces ignored), so `CI=false` or `CI=0` on a developer machine still asks.
 */
function isCiFlagSet(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized !== '' && normalized !== 'false' && normalized !== '0';
}

/**
 * Whether to ask before moving retired template files to a backup (#1941): only when both stdin
 * and stdout are terminals, outside CI (`CI`/`GITHUB_ACTIONS`, see {@link isCiFlagSet}), and not
 * for `--all`, `--dry-run` or `--yes`. Otherwise they are moved when every safety condition holds.
 */
export function shouldConfirmOrphanRemoval(
  options: UpdateCommandOptions,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  if (isCiFlagSet(env.CI) || isCiFlagSet(env.GITHUB_ACTIONS)) return false;
  return !options.all && !options.dryRun && !options.yes;
}

/** Reads one answer line. */
export type AskLine = (question: string) => Promise<string>;

/** Ctrl+C at the prompt (#1941 review L1). */
export class InputInterruptedError extends Error {
  constructor() {
    super('interrupted');
    this.name = 'InputInterruptedError';
  }
}

/**
 * Ask `question` on the terminal (readline, like the self-update prompt) and return the answer.
 * End of input (Ctrl+D) returns '' (the default answer); Ctrl+C rejects with
 * {@link InputInterruptedError}. Both print a newline first, so later output starts on its own
 * line instead of joining the prompt (#1941 review L2).
 */
export async function askLine(
  question: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout
): Promise<string> {
  const rl = createInterface({ input, output });
  let settled = false;
  try {
    return await new Promise<string>((resolve, reject) => {
      const endLine = (): boolean => {
        if (settled) return false;
        settled = true;
        output.write('\n');
        return true;
      };
      rl.once('SIGINT', () => {
        if (endLine()) reject(new InputInterruptedError());
      });
      rl.once('close', () => {
        if (endLine()) resolve('');
      });
      rl.question(question).then(resolve, reject);
    });
  } finally {
    // Closing the interface emits 'close'; after an answer that must not print another newline.
    settled = true;
    rl.close();
  }
}

/**
 * The confirmation passed to `update()` (#1941): prints the project, the backup directory and the
 * files, then asks a y/N question. Only 'y' or 'yes' moves them to the backup; anything else,
 * including an empty answer, keeps them. Ctrl+C keeps them too and says so (the update goes on:
 * the components are already updated, and stopping now would leave a stale lock); any other
 * failure of `ask` is passed on, and update() keeps the files with a warning.
 */
export function createOrphanRemovalPrompt(
  targetDir: string,
  ask: AskLine = askLine
): OrphanRemovalConfirmation {
  return async (paths, { backupDir }) => {
    console.log(
      i18n.t('cli.update.orphanConfirmHeader', {
        count: String(paths.length),
        path: targetDir,
        backup: backupDir,
      })
    );
    for (const path of paths) {
      console.log(`  - ${path}`);
    }
    let answer: string;
    try {
      answer = await ask(i18n.t('cli.update.orphanConfirmPrompt'));
    } catch (err) {
      if (!(err instanceof InputInterruptedError)) throw err;
      console.log(i18n.t('cli.update.orphanConfirmInterrupted'));
      return false;
    }
    const normalized = answer.trim().toLowerCase();
    const accepted = normalized === 'y' || normalized === 'yes';
    if (!accepted) {
      console.log(i18n.t('cli.update.orphanConfirmDeclined'));
    }
    return accepted;
  };
}

/**
 * Non-blocking check for a newer CLI version.
 * Prints an informational message if a newer version is available.
 * Silently swallows any error (offline, npm timeout, malformed response).
 */
async function checkCliVersion(checkFn: typeof checkSelfUpdate): Promise<void> {
  try {
    const result = checkFn({ currentVersion: packageJson.version as string });
    if (result.updateAvailable && result.latestVersion) {
      console.log(
        i18n.t('cli.update.newVersionAvailable', {
          latest: result.latestVersion,
          current: packageJson.version as string,
        })
      );
    }
  } catch {
    // Non-blocking: silently ignore any version check failures
  }
}

/**
 * Exit with a status that reflects the child process result, mapping signal
 * termination to the conventional 128 + signal-number exit code.
 */
function exitWithChildStatus(child: {
  status: number | null;
  signal: NodeJS.Signals | null;
}): never {
  if (child.signal) {
    const signalNumber = osConstants.signals[child.signal];
    if (signalNumber !== undefined) {
      process.exit(128 + signalNumber);
    }
    // Unknown signal name — fall through to status-based exit
  }
  process.exit(child.status ?? 1);
}

/** Minimal spawnSync signature used by reexecUpdatedCli — injectable for tests. */
type SpawnSyncFn = (
  command: string,
  args: string[],
  options: { stdio: 'inherit'; env: NodeJS.ProcessEnv }
) => { status: number | null; signal: NodeJS.Signals | null };

/**
 * Re-exec the current process with OMCUSTOM_SKIP_SELF_UPDATE=true so the child
 * process loads the newly-installed package version. Without this, the running
 * process retains stale top-level imports and downstream project updates fail
 * with "Downgrade prevented" (#860).
 */
async function reexecUpdatedCli(toVersion: string, spawnFn?: SpawnSyncFn): Promise<void> {
  const cliEntry = process.argv[1];
  if (!cliEntry) {
    console.warn(i18n.t('cli.update.reexecArgvMissing'));
    return;
  }
  console.log(i18n.t('cli.update.selfUpdateReexec', { version: toVersion }));
  // Dynamic import used intentionally: avoids static binding to node:child_process,
  // which allows mock.module('node:child_process') in tests to work correctly.
  const { spawnSync } = await import('node:child_process');
  const child = (spawnFn ?? spawnSync)(process.execPath, [cliEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, OMCUSTOM_SKIP_SELF_UPDATE: 'true' },
  });
  exitWithChildStatus(child); // helper added in D3
}

/**
 * Handle self-update of the oh-my-customcode package.
 * Performs re-exec if an update was installed and the guard env var is not set.
 */
async function handleSelfUpdate(spawnFn?: SpawnSyncFn): Promise<void> {
  try {
    // forceRefresh: always query npm view fresh to avoid installing a stale
    // cached latest version (#862). Cache is intended for the init prompt path,
    // not for explicit `omcustom update`.
    const selfUpdateResult = executeSelfUpdate({ forceRefresh: true });
    if (selfUpdateResult.updated) {
      console.log(
        i18n.t('cli.update.selfUpdateDone', {
          from: selfUpdateResult.fromVersion,
          to: selfUpdateResult.toVersion,
        })
      );
      if (process.env.OMCUSTOM_SKIP_SELF_UPDATE !== 'true') {
        await reexecUpdatedCli(selfUpdateResult.toVersion, spawnFn);
      }
    }
  } catch {
    // Non-blocking: self-update failure must not stop the external update workflow
    console.warn(i18n.t('cli.update.selfUpdateFailed'));
  }
}

/**
 * Execute the update command
 */
export async function updateCommand(
  options: UpdateCommandOptions = {},
  cliVersionCheck: typeof checkSelfUpdate = checkSelfUpdate,
  spawnFn?: SpawnSyncFn
): Promise<void> {
  // Step 0: Self-update oh-my-customcode package before external updates
  if (!options.skipSelf) {
    await handleSelfUpdate(spawnFn);
  } else {
    // Fallback: notification-only version check when self-update is skipped
    await checkCliVersion(cliVersionCheck);
  }

  try {
    if (options.all) {
      await updateAllProjects(options);
      return;
    }

    if (process.stdout.isTTY && !options.dryRun) {
      const didInteractive = await maybeRunInteractiveUpdate(options);
      if (didInteractive) return;
    }

    await updateSingleProject(process.cwd(), options);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(i18n.t('cli.update.summaryFailed', { error: errorMessage }));
    process.exit(1);
  }
}

/**
 * Update a single project directory
 */
async function updateSingleProject(
  targetDir: string,
  options: UpdateCommandOptions
): Promise<boolean> {
  // Build components list from flags
  const components = buildComponentsList(options);

  // Show dry run header if applicable
  if (options.dryRun) {
    console.log(i18n.t('cli.update.dryRunHeader'));
  }

  // Execute update
  const updateOptions: UpdateOptions = {
    targetDir,
    components,
    force: options.force,
    preserveCustomizations: true,
    forceOverwriteAll: options.forceOverwriteAll,
    dryRun: options.dryRun,
    backup: options.backup,
    hard: options.hard,
    confirmOrphanRemoval: shouldConfirmOrphanRemoval(options)
      ? createOrphanRemovalPrompt(targetDir)
      : undefined,
  };

  const result = await update(updateOptions);

  // Print results
  printUpdateResults(result);

  if (!result.success) {
    process.exit(1);
  }
  return true;
}

type ProjectUpdateOutcome = 'updated' | 'failed' | 'skipped';

/**
 * Log the result of a single project update (`--all`) and return the outcome, followed by the
 * project's orphan retirement (removed, would-remove on a dry run, kept with the reason), which
 * the batch output would otherwise hide (its warnings are not printed per project).
 * Extracted to keep updateAllProjects below the complexity limit.
 */
export function reportProjectUpdateResult(
  project: { name: string; version: string | null },
  result: UpdateResult,
  currentVersion: string
): ProjectUpdateOutcome {
  let outcome: ProjectUpdateOutcome;
  if (result.success && result.skippedSource) {
    console.log(i18n.t('cli.update.allProjectSkippedSource', { name: project.name }));
    outcome = 'skipped';
  } else if (result.success) {
    const from = result.previousVersion || project.version || 'unknown';
    const to = result.newVersion || currentVersion;
    console.log(i18n.t('cli.update.allProjectUpdated', { from, to }));
    outcome = 'updated';
  } else {
    const errorMsg = result.error ?? 'unknown error';
    console.log(i18n.t('cli.update.allProjectFailed', { error: errorMsg }));
    outcome = 'failed';
  }
  printOrphanRetirement(result, true);
  return outcome;
}

/**
 * Batch update all outdated projects found by project discovery.
 * Runs sequentially so progress output is readable.
 */
async function updateAllProjects(options: UpdateCommandOptions): Promise<void> {
  const { findProjects } = await import('./projects.js');
  const { cleanRegistry } = await import('../core/registry.js');
  const currentVersion = packageJson.version as string;

  // Remove stale registry entries whose paths no longer exist on disk.
  // This prevents update --all from trying to recreate deleted project folders.
  await cleanRegistry();

  console.log(i18n.t('cli.update.allScanning'));
  const projects = await findProjects();

  if (projects.length === 0) {
    console.log(i18n.t('cli.update.allNoneFound'));
    return;
  }

  const outdated = projects.filter((p) => p.status === 'outdated');

  if (outdated.length === 0) {
    console.log(i18n.t('cli.update.allNoneOutdated'));
    return;
  }

  console.log(i18n.t('cli.update.allOutdatedFound', { count: String(outdated.length) }));

  let updatedCount = 0;
  let failedCount = 0;

  for (const [index, project] of outdated.entries()) {
    const current = String(index + 1);
    const total = String(outdated.length);
    process.stdout.write(
      `${i18n.t('cli.update.allProjectUpdating', { current, total, name: project.name })} `
    );

    try {
      const components = buildComponentsList(options);
      const updateOptions: UpdateOptions = {
        targetDir: project.path,
        components,
        force: options.force,
        preserveCustomizations: true,
        forceOverwriteAll: options.forceOverwriteAll,
        dryRun: options.dryRun,
        backup: options.backup,
        hard: options.hard,
      };

      const result = await update(updateOptions);
      const outcome = reportProjectUpdateResult(project, result, currentVersion);
      if (outcome === 'updated') {
        updatedCount++;
      } else if (outcome === 'failed') {
        failedCount++;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(i18n.t('cli.update.allProjectFailed', { error: errorMessage }));
      failedCount++;
    }
  }

  console.log(
    i18n.t('cli.update.allDone', {
      updated: String(updatedCount),
      failed: String(failedCount),
    })
  );
}

/**
 * Interactive checkbox UI for selecting projects to update.
 * Returns true if interactive mode was triggered (project list found),
 * false if there are no discovered projects and we should fall back to
 * single-project update.
 */
async function maybeRunInteractiveUpdate(options: UpdateCommandOptions): Promise<boolean> {
  const { findProjects } = await import('./projects.js');
  const currentVersion = packageJson.version as string;

  const projects = await findProjects();

  // Only enter interactive mode when multiple projects are discovered
  if (projects.length <= 1) {
    return false;
  }

  const { checkbox } = await import('@inquirer/prompts');

  const choices = projects.map((p) => {
    const versionLabel = p.version ?? 'unknown';
    const isLatest = p.status === 'latest';
    return {
      name: `${p.name.padEnd(25)} ${versionLabel.padEnd(10)} → ${currentVersion}  (${p.path})`,
      value: p.path,
      checked: p.status === 'outdated',
      disabled: isLatest ? (i18n.t('cli.update.projectLatestSuffix') as string) : false,
    };
  });

  const selected = await checkbox({
    message: i18n.t('cli.update.interactiveSelect'),
    choices,
  });

  if (selected.length === 0) {
    console.log(i18n.t('cli.update.interactiveNoneSelected'));
    return true;
  }

  console.log(i18n.t('cli.update.interactiveUpdating'));

  for (const projectPath of selected) {
    await updateSingleProject(projectPath, options).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(i18n.t('cli.update.allProjectFailed', { error: errorMessage }));
    });
  }

  return true;
}

/**
 * Build components list from CLI flags
 */
function buildComponentsList(options: UpdateCommandOptions): UpdateComponent[] | undefined {
  const components: UpdateComponent[] = [];

  if (options.agents) {
    components.push('agents');
  }
  if (options.skills) {
    components.push('skills');
  }
  if (options.rules) {
    components.push('rules');
  }
  if (options.guides) {
    components.push('guides');
  }
  if (options.hooks) {
    components.push('hooks');
  }
  if (options.contexts) {
    components.push('contexts');
  }

  // If no specific components selected, return undefined (update all)
  return components.length > 0 ? components : undefined;
}

/** Where retired leftovers go, as a pattern: dry runs and results without `backupDir`. */
const RETIRED_BACKUP_PATTERN = '.omcustom-backup-<timestamp>/retired';

/** Print `paths` below a header, or nothing when there are none. */
function printPathGroup(header: string, paths: readonly string[]): void {
  if (paths.length === 0) return;
  console.log(header);
  for (const path of paths) {
    console.log(`  - ${path}`);
  }
}

/**
 * Print leftovers that oh-my-customcode no longer ships (#1935): files moved to the backup (with
 * the backup directory and how to restore, #1938), dry-run candidates, and kept files.
 *
 * Kept files (#1938-1): those kept by the user's preserve settings get one count line; those kept
 * because the user declined the confirmation are not repeated (the prompt already said so); the
 * rest are listed for the user to act on. Their reasons are printed with the warnings on a single
 * project update; `withReasons` (used by `--all`, which prints no warnings) appends them.
 */
function printOrphanRetirement(result: UpdateResult, withReasons = false): void {
  const orphans = result.orphanRetirement;
  if (!orphans) return;
  const count = (items: readonly unknown[]): string => String(items.length);
  printPathGroup(
    i18n.t('cli.update.orphansMoved', {
      count: count(orphans.removed),
      path: orphans.backupDir ?? RETIRED_BACKUP_PATTERN,
    }),
    orphans.removed
  );
  if (orphans.removed.length > 0) {
    console.log(i18n.t('cli.update.orphansRestoreHint'));
  }
  printPathGroup(
    i18n.t('cli.update.orphansWouldMove', {
      count: count(orphans.wouldRemove),
      path: RETIRED_BACKUP_PATTERN,
    }),
    orphans.wouldRemove
  );
  const byPreserveSettings = orphans.preserved.filter(
    (entry) => entry.keptBy === 'preserve-settings'
  );
  if (byPreserveSettings.length > 0) {
    console.log(
      i18n.t('cli.update.orphansKeptByPreserveSettings', { count: count(byPreserveSettings) })
    );
  }
  const actionable = orphans.preserved.filter((entry) => entry.keptBy === undefined);
  printPathGroup(
    i18n.t(withReasons ? 'cli.update.orphansPreservedWithReasons' : 'cli.update.orphansPreserved', {
      count: count(actionable),
    }),
    actionable.map((entry) => (withReasons ? `${entry.path} (${entry.reason})` : entry.path))
  );
}

/**
 * Print update results
 */
export function printUpdateResults(result: UpdateResult): void {
  // Show updated components
  for (const component of result.updatedComponents) {
    console.log(i18n.t('cli.update.componentUpdated', { component }));
  }

  // Show skipped components
  for (const component of result.skippedComponents) {
    console.log(i18n.t('cli.update.componentSkipped', { component }));
  }

  // Show preserved files
  if (result.preservedFiles.length > 0) {
    console.log(
      i18n.t('cli.update.preservedFiles', { count: String(result.preservedFiles.length) })
    );
  }

  // Show namespace synced files
  if ((result.namespaceSynced?.length ?? 0) > 0) {
    console.log(
      i18n.t('cli.update.namespaceSynced', { count: String(result.namespaceSynced.length) })
    );
    for (const file of result.namespaceSynced) {
      console.log(`  ↻ ${file}`);
    }
  }

  printOrphanRetirement(result);

  // Show backup path
  if (result.backedUpPaths.length > 0) {
    for (const path of result.backedUpPaths) {
      console.log(i18n.t('cli.update.backupCreated', { path }));
    }
  }

  // Show warnings
  for (const warning of result.warnings) {
    console.warn(warning);
  }

  // Show summary
  if (result.success) {
    console.log(
      i18n.t('cli.update.summary', {
        updated: String(result.updatedComponents.length),
        skipped: String(result.skippedComponents.length),
      })
    );
  } else if (result.error) {
    console.error(i18n.t('cli.update.summaryFailed', { error: result.error }));
  }
}

/**
 * Import UpdateResult type from core
 */
type UpdateResult = Awaited<ReturnType<typeof update>>;

export default updateCommand;
