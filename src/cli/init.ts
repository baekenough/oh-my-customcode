/**
 * omcustom init command
 * Initializes oh-my-customcode in the current project
 */

import { join } from 'node:path';
import { type InstallResult as InstallerResult, install } from '../core/installer.js';
import { i18n } from '../i18n/index.js';
import { fileExists } from '../utils/fs.js';

/**
 * Options for the init command
 */
export interface InitOptions {
  /** Language for templates and messages (en|ko) */
  lang: 'en' | 'ko';
  /** Whether to overwrite existing files */
  force?: boolean;
}

/**
 * Result of the init command
 */
export interface InitResult {
  success: boolean;
  message: string;
  installedPaths?: string[];
  errors?: string[];
}

/**
 * Check if .claude directory already exists
 * @param targetDir - Target directory to check
 * @returns True if .claude exists
 */
export async function checkExistingInstallation(targetDir: string): Promise<boolean> {
  const claudeDir = join(targetDir, '.claude');
  return fileExists(claudeDir);
}

/** Components that live under .claude directory */
const CLAUDE_SUBDIR_COMPONENTS = new Set(['rules', 'hooks', 'contexts']);

/**
 * Convert component name to its full path
 */
function componentToPath(targetDir: string, component: string): string {
  if (component === 'claude-md') {
    return join(targetDir, 'CLAUDE.md');
  }
  if (CLAUDE_SUBDIR_COMPONENTS.has(component)) {
    return join(targetDir, '.claude', component);
  }
  return join(targetDir, component);
}

/**
 * Build list of installed paths from components
 */
function buildInstalledPaths(targetDir: string, components: string[]): string[] {
  return components.map((component) => componentToPath(targetDir, component));
}

/**
 * Log items with a prefix
 */
function logItems(items: string[], formatter: (item: string) => void): void {
  for (const item of items) {
    formatter(item);
  }
}

/**
 * Log installation success details
 */
function logSuccessDetails(installedPaths: string[], skippedComponents: string[]): void {
  console.log(i18n.t('cli.init.success'));
  console.log('\nInstalled paths:');
  logItems(installedPaths, (path) => console.log(`  - ${path}`));

  if (skippedComponents.length > 0) {
    console.log('\nSkipped (already exist):');
    logItems(skippedComponents, (component) => console.log(`  - ${component}`));
  }
}

/**
 * Create a failure result
 */
function createFailureResult(errorMessage: string): InitResult {
  return {
    success: false,
    message: i18n.t('cli.init.failed'),
    errors: [errorMessage],
  };
}

/**
 * Handle existing installation notification
 */
function notifyExistingInstallation(): void {
  console.log(i18n.t('cli.init.exists'));
  console.log(i18n.t('cli.init.backing_up'));
}

/**
 * Log backup and warning information from install result
 */
function logInstallResultInfo(result: InstallerResult): void {
  logItems(result.backedUpPaths, (path) => console.log(i18n.t('cli.init.backedUp', { path })));
  logItems(result.warnings, (warning) => console.warn(`Warning: ${warning}`));
}

/**
 * Execute the init command
 * @param options - Init command options
 * @returns Result of the init operation
 */
export async function initCommand(options: InitOptions): Promise<InitResult> {
  const targetDir = process.cwd();
  console.log(i18n.t('cli.init.start'));

  try {
    const exists = await checkExistingInstallation(targetDir);
    if (exists) {
      notifyExistingInstallation();
    }

    console.log(i18n.t('cli.init.copying'));
    const installResult = await install({
      targetDir,
      language: options.lang,
      force: options.force ?? false,
      backup: exists,
    });

    if (!installResult.success) {
      return createFailureResult(installResult.error || 'Unknown error');
    }

    const installedPaths = buildInstalledPaths(targetDir, installResult.installedComponents);
    logInstallResultInfo(installResult);
    logSuccessDetails(installedPaths, installResult.skippedComponents);

    return {
      success: true,
      message: i18n.t('cli.init.success'),
      installedPaths,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(i18n.t('cli.init.failed'), errorMessage);
    return createFailureResult(errorMessage);
  }
}

export default initCommand;
