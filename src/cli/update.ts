/**
 * omcustom update command
 * Updates agents to the latest version
 */

import { detectProvider } from '../core/provider.js';
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
  /** Provider to update (auto, claude, codex) */
  provider?: string;
}

/**
 * Execute the update command
 */
export async function updateCommand(options: UpdateCommandOptions = {}): Promise<void> {
  try {
    const targetDir = process.cwd();

    // Detect provider
    const detection = await detectProvider({
      targetDir,
      override: options.provider as 'auto' | 'claude' | 'codex' | undefined,
    });
    const provider = detection.provider;

    // Build components list from flags
    const components = buildComponentsList(options);

    // Show dry run header if applicable
    if (options.dryRun) {
      console.log(i18n.t('cli.update.dryRunHeader'));
    }

    // Execute update
    const updateOptions: UpdateOptions = {
      targetDir,
      provider,
      components,
      force: options.force,
      preserveCustomizations: true,
      forceOverwriteAll: options.forceOverwriteAll,
      dryRun: options.dryRun,
      backup: options.backup,
    };

    const result = await update(updateOptions);

    // Print results
    printUpdateResults(result);

    // Exit with appropriate code
    if (!result.success) {
      process.exit(1);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(i18n.t('cli.update.summaryFailed', { error: errorMessage }));
    process.exit(1);
  }
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
    console.log(i18n.t('cli.update.preservedFiles', { count: result.preservedFiles.length }));
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
        updated: result.updatedComponents.length,
        skipped: result.skippedComponents.length,
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
