/**
 * omcustom init command
 * Initializes oh-my-customcode in the current project
 */

import { join } from 'node:path';
import { type InstallResult as InstallerResult, install } from '../core/installer.js';
import { getProviderLayout, type LlmProvider, type ProviderPreference } from '../core/layout.js';
import { checkPythonAvailable, generateMCPConfig } from '../core/mcp-config.js';
import { detectProvider } from '../core/provider.js';
import { i18n } from '../i18n/index.js';
import { fileExists } from '../utils/fs.js';

/**
 * Options for the init command
 */
export interface InitOptions {
  /** Language for templates and messages (en|ko) */
  lang: 'en' | 'ko';
  /** Provider selection (auto|claude|codex) */
  provider?: ProviderPreference;
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
 * Check if provider root directory already exists
 * @param targetDir - Target directory to check
 * @returns True if provider root exists
 */
export async function checkExistingInstallation(
  targetDir: string,
  provider: LlmProvider
): Promise<boolean> {
  const layout = getProviderLayout(provider);
  const rootDir = join(targetDir, layout.rootDir);
  return fileExists(rootDir);
}

/** Components that live under provider root directory */
const PROVIDER_SUBDIR_COMPONENTS = new Set(['rules', 'hooks', 'contexts', 'agents', 'skills']);

/**
 * Convert component name to its full path
 */
function componentToPath(targetDir: string, provider: LlmProvider, component: string): string {
  if (component === 'entry-md') {
    const layout = getProviderLayout(provider);
    return join(targetDir, layout.entryFile);
  }
  if (PROVIDER_SUBDIR_COMPONENTS.has(component)) {
    const layout = getProviderLayout(provider);
    return join(targetDir, layout.rootDir, component);
  }
  return join(targetDir, component);
}

/**
 * Build list of installed paths from components
 */
function buildInstalledPaths(
  targetDir: string,
  provider: LlmProvider,
  components: string[]
): string[] {
  return components.map((component) => componentToPath(targetDir, provider, component));
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
    const detection = await detectProvider({ targetDir, override: options.provider });
    const provider = detection.provider;
    const layout = getProviderLayout(provider);

    const exists = await checkExistingInstallation(targetDir, provider);
    if (exists) {
      console.log(i18n.t('cli.init.exists', { rootDir: layout.rootDir }));
      console.log(i18n.t('cli.init.backing_up'));
    }

    console.log(i18n.t('cli.init.copying'));
    const installResult = await install({
      targetDir,
      language: options.lang,
      provider,
      force: options.force ?? false,
      backup: exists,
    });

    if (!installResult.success) {
      return createFailureResult(installResult.error || 'Unknown error');
    }

    const installedPaths = buildInstalledPaths(
      targetDir,
      provider,
      installResult.installedComponents
    );
    logInstallResultInfo(installResult);
    logSuccessDetails(installedPaths, installResult.skippedComponents);

    // Generate MCP config for ontology-rag if Python is available
    const pythonAvailable = await checkPythonAvailable();
    if (pythonAvailable) {
      try {
        await generateMCPConfig(targetDir, provider);
      } catch {
        console.warn('Warning: Failed to generate MCP config. You can configure it manually.');
      }
    } else {
      console.warn('Warning: Python not found. Skipping MCP server configuration.');
      console.warn('Install Python 3.10+ and ontology-rag to enable MCP integration.');
    }

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
