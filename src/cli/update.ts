/**
 * omcustom update command
 * Updates agents to the latest version
 *
 * Supports three modes:
 * 1. Single-project update (default): updates current directory
 * 2. --all flag: batch update all outdated projects found by project discovery
 * 3. Interactive (TTY, no --all): checkbox UI to select which projects to update
 */

import packageJson from '../../package.json';
import { checkSelfUpdate } from '../core/self-update.js';
import { type UpdateComponent, type UpdateOptions, update } from '../core/updater.js';
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
 * Execute the update command
 */
export async function updateCommand(
  options: UpdateCommandOptions = {},
  cliVersionCheck: typeof checkSelfUpdate = checkSelfUpdate
): Promise<void> {
  // Non-blocking CLI self-update notification (inform but never block)
  await checkCliVersion(cliVersionCheck);

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
  };

  const result = await update(updateOptions);

  // Print results
  printUpdateResults(result);

  if (!result.success) {
    process.exit(1);
  }
  return true;
}

/**
 * Batch update all outdated projects found by project discovery.
 * Runs sequentially so progress output is readable.
 */
async function updateAllProjects(options: UpdateCommandOptions): Promise<void> {
  const { findProjects } = await import('./projects.js');
  const currentVersion = packageJson.version as string;

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

      if (result.success) {
        const from = result.previousVersion || project.version || 'unknown';
        const to = result.newVersion || currentVersion;
        console.log(i18n.t('cli.update.allProjectUpdated', { from, to }));
        updatedCount++;
      } else {
        const errorMsg = result.error ?? 'unknown error';
        console.log(i18n.t('cli.update.allProjectFailed', { error: errorMsg }));
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

/**
 * Print update results
 */
function printUpdateResults(result: UpdateResult): void {
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
