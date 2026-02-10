/**
 * Installer module - Install/copy templates
 */

import { copyFile as fsCopyFile, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  copyDirectory,
  ensureDirectory,
  fileExists,
  getPackageRoot,
  readJsonFile,
  resolveTemplatePath,
} from '../utils/fs.js';
import { debug, error, info, success, warn } from '../utils/logger.js';
import { loadConfig, saveConfig } from './config.js';
import {
  getComponentPath,
  getEntryTemplateName,
  getProviderLayout,
  type InstallComponent,
  type LlmProvider,
} from './layout.js';

/**
 * Options for installation
 */
export interface InstallOptions {
  /** Target directory to install to */
  targetDir: string;
  /** Language for entry doc (en or ko) */
  language?: 'en' | 'ko';
  /** Provider to install for (claude|codex) */
  provider?: LlmProvider;
  /** Whether to overwrite existing files */
  force?: boolean;
  /** Whether to backup existing files before overwriting */
  backup?: boolean;
  /** Specific components to install (default: all) */
  components?: InstallComponent[];
  /** Skip confirmation prompts */
  skipConfirm?: boolean;
}

/**
 * Components that can be installed
 * Updated for official format (commands absorbed into skills)
 */
export type { InstallComponent };

/**
 * Result of installation
 */
export interface InstallResult {
  /** Whether installation was successful */
  success: boolean;
  /** Path to installed directory */
  installedPath: string;
  /** List of installed components */
  installedComponents: InstallComponent[];
  /** List of skipped components (already exist) */
  skippedComponents: InstallComponent[];
  /** List of backed up paths */
  backedUpPaths: string[];
  /** Any warnings during installation */
  warnings: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Template manifest describing available templates
 */
export interface TemplateManifest {
  /** Version of the templates */
  version: string;
  /** Last updated timestamp */
  lastUpdated: string;
  /** Available components */
  components: {
    name: InstallComponent;
    path: string;
    description: string;
    files: number;
  }[];
  /** Source repository */
  source: string;
}

/**
 * Directory structure to create
 * Updated for official format:
 * - agents/ is flat (no subdirectories)
 * - skills/ contains skill directories
 * - commands/ removed (absorbed into skills)
 */
const DEFAULT_LANGUAGE: 'en' | 'ko' = 'en';

/**
 * Get the template directory path from the installed package
 */
export function getTemplateDir(): string {
  const packageRoot = getPackageRoot();
  return join(packageRoot, 'templates');
}

/**
 * Initialize result object for installation
 */
function createInstallResult(targetDir: string): InstallResult {
  return {
    success: false,
    installedPath: targetDir,
    installedComponents: [],
    skippedComponents: [],
    backedUpPaths: [],
    warnings: [],
  };
}

/**
 * Ensure target directory exists
 */
async function ensureTargetDirectory(targetDir: string): Promise<void> {
  const targetExists = await fileExists(targetDir);
  if (!targetExists) {
    await ensureDirectory(targetDir);
  }
}

/**
 * Handle backup of existing installation
 */
async function handleBackup(
  targetDir: string,
  provider: LlmProvider,
  shouldBackup: boolean,
  result: InstallResult
): Promise<void> {
  if (!shouldBackup) return;

  const backupPaths = await backupExistingInstallation(targetDir, provider);
  result.backedUpPaths.push(...backupPaths);
  if (backupPaths.length > 0) {
    info('install.backup', { path: backupPaths[0] });
  }
}

/**
 * Check for existing files and add warnings if needed
 */
async function checkAndWarnExisting(
  targetDir: string,
  provider: LlmProvider,
  force: boolean,
  backup: boolean,
  result: InstallResult
): Promise<void> {
  if (force || backup) return;

  const existingPaths = await checkExistingPaths(targetDir, provider);
  if (existingPaths.length > 0) {
    const layout = getProviderLayout(provider);
    warn('install.exists', { rootDir: layout.rootDir });
    result.warnings.push(
      `Existing files found: ${existingPaths.join(', ')}. Use --force to overwrite or --backup to backup first.`
    );
  }
}

/**
 * Verify template directory exists
 */
async function verifyTemplateDirectory(): Promise<void> {
  const templateDir = getTemplateDir();
  if (!(await fileExists(templateDir))) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }
}

/**
 * Install all components and track results
 */
async function installAllComponents(
  targetDir: string,
  provider: LlmProvider,
  options: InstallOptions,
  result: InstallResult
): Promise<void> {
  const components = options.components || getAllComponents();

  for (const component of components) {
    await installSingleComponent(targetDir, provider, component, options, result);
  }
}

/**
 * Install a single component with error handling
 */
async function installSingleComponent(
  targetDir: string,
  provider: LlmProvider,
  component: InstallComponent,
  options: InstallOptions,
  result: InstallResult
): Promise<void> {
  try {
    const installed = await installComponent(targetDir, provider, component, options);
    if (installed) {
      result.installedComponents.push(component);
    } else {
      result.skippedComponents.push(component);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.warnings.push(`Failed to install ${component}: ${message}`);
  }
}

/**
 * Install entry doc and track result
 */
async function installEntryDocWithTracking(
  targetDir: string,
  provider: LlmProvider,
  options: InstallOptions,
  result: InstallResult
): Promise<void> {
  const language = options.language ?? DEFAULT_LANGUAGE;
  const overwrite = !!(options.force || options.backup);
  const installed = await installEntryDoc(targetDir, provider, language, overwrite);

  if (installed) {
    result.installedComponents.push('entry-md');
  } else {
    result.skippedComponents.push('entry-md');
  }
}

/**
 * Update configuration after installation
 */
async function updateInstallConfig(
  targetDir: string,
  provider: LlmProvider,
  options: InstallOptions,
  installedComponents: InstallComponent[]
): Promise<void> {
  const config = await loadConfig(targetDir);
  config.language = options.language ?? DEFAULT_LANGUAGE;
  config.provider = provider;
  config.installedAt = new Date().toISOString();
  config.installedComponents = installedComponents;
  await saveConfig(targetDir, config);
}

/**
 * Install oh-my-customcode templates to target directory
 */
export async function install(options: InstallOptions): Promise<InstallResult> {
  const result = createInstallResult(options.targetDir);
  const provider = options.provider ?? 'claude';

  try {
    info('install.start', { targetDir: options.targetDir });

    await ensureTargetDirectory(options.targetDir);
    await handleBackup(options.targetDir, provider, !!options.backup, result);
    await checkAndWarnExisting(
      options.targetDir,
      provider,
      !!options.force,
      !!options.backup,
      result
    );
    await verifyTemplateDirectory();

    await installAllComponents(options.targetDir, provider, options, result);
    await installEntryDocWithTracking(options.targetDir, provider, options, result);
    await updateInstallConfig(options.targetDir, provider, options, result.installedComponents);

    result.success = true;
    success('install.success');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    error('install.failed', { error: message });
  }

  return result;
}

/**
 * Copy templates from package to target directory
 */
export async function copyTemplates(
  targetDir: string,
  templatePath: string,
  options?: { overwrite?: boolean; preserveSymlinks?: boolean }
): Promise<void> {
  const srcPath = resolveTemplatePath(templatePath);
  const destPath = join(targetDir, templatePath);

  await copyDirectory(srcPath, destPath, {
    overwrite: options?.overwrite ?? false,
    preserveSymlinks: options?.preserveSymlinks ?? true,
    preserveTimestamps: true,
  });
}

/**
 * Create the directory structure for oh-my-customcode
 */
export async function createDirectoryStructure(
  targetDir: string,
  provider: LlmProvider = 'claude'
): Promise<void> {
  const layout = getProviderLayout(provider);
  for (const dir of layout.directoryStructure) {
    const fullPath = join(targetDir, dir);
    await ensureDirectory(fullPath);
  }
}

/**
 * Get the template manifest
 */
export async function getTemplateManifest(
  provider: LlmProvider = 'claude'
): Promise<TemplateManifest> {
  const packageRoot = getPackageRoot();
  const layout = getProviderLayout(provider);
  const manifestPath = join(packageRoot, 'templates', layout.manifestFile);

  if (await fileExists(manifestPath)) {
    return readJsonFile<TemplateManifest>(manifestPath);
  }

  // Return default manifest if not found
  return {
    version: '0.0.0',
    lastUpdated: new Date().toISOString(),
    components: getAllComponents().map((name) => ({
      name,
      path: getComponentPath(provider, name),
      description: `${name} component`,
      files: 0,
    })),
    source: 'https://github.com/baekenough/oh-my-customcode',
  };
}

/**
 * Get all available components
 * Updated: commands removed (absorbed into skills)
 */
function getAllComponents(): InstallComponent[] {
  return ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts'];
}

/**
 * Install a single component
 */
async function installComponent(
  targetDir: string,
  provider: LlmProvider,
  component: InstallComponent,
  options: InstallOptions
): Promise<boolean> {
  if (component === 'entry-md') {
    return false;
  }

  const templatePath = getComponentPath(provider, component);
  if (!templatePath) {
    return false;
  }

  const destPath = join(targetDir, templatePath);
  const destExists = await fileExists(destPath);

  // Skip if exists and not forcing/backing up
  if (destExists && !options.force && !options.backup) {
    debug('install.component_skipped', { component });
    return false;
  }

  const srcPath = resolveTemplatePath(templatePath);
  if (!(await fileExists(srcPath))) {
    warn('install.template_not_found', { component, path: srcPath });
    return false;
  }

  // Copy with symlink preservation for refs/ directories
  await copyDirectory(srcPath, destPath, {
    overwrite: !!(options.force || options.backup),
    preserveSymlinks: true,
    preserveTimestamps: true,
  });
  debug('install.component_installed', { component });
  return true;
}

/**
 * Install entry doc with the selected language
 */
async function installEntryDoc(
  targetDir: string,
  provider: LlmProvider,
  language: 'en' | 'ko',
  overwrite = false
): Promise<boolean> {
  const layout = getProviderLayout(provider);
  const templateFile = getEntryTemplateName(provider, language);
  const srcPath = resolveTemplatePath(templateFile);
  const destPath = join(targetDir, layout.entryFile);

  // Check if source template exists
  if (!(await fileExists(srcPath))) {
    warn('install.entry_md_not_found', { language, path: srcPath, entry: layout.entryFile });
    return false;
  }

  // Check if destination exists and we're not overwriting
  const destExists = await fileExists(destPath);
  if (destExists && !overwrite) {
    debug('install.entry_md_skipped', { reason: 'exists', language, entry: layout.entryFile });
    return false;
  }

  // Copy the template file to entry doc
  await fsCopyFile(srcPath, destPath);
  debug('install.entry_md_installed', { language, entry: layout.entryFile });
  return true;
}

/**
 * Backup existing directory or file
 */
async function backupExisting(sourcePath: string, backupDir: string): Promise<string> {
  const name = basename(sourcePath);
  const backupPath = join(backupDir, name);

  await rename(sourcePath, backupPath);
  return backupPath;
}

/**
 * Check which installation paths already exist
 * Updated: paths now under provider root for official format
 */
async function checkExistingPaths(targetDir: string, provider: LlmProvider): Promise<string[]> {
  const layout = getProviderLayout(provider);
  const pathsToCheck = [layout.entryFile, layout.rootDir, 'guides'];

  const existingPaths: string[] = [];

  for (const relativePath of pathsToCheck) {
    const fullPath = join(targetDir, relativePath);
    if (await fileExists(fullPath)) {
      existingPaths.push(relativePath);
    }
  }

  return existingPaths;
}

/**
 * Backup existing installation files to a timestamped directory
 */
async function backupExistingInstallation(
  targetDir: string,
  provider: LlmProvider
): Promise<string[]> {
  const layout = getProviderLayout(provider);
  const existingPaths = await checkExistingPaths(targetDir, provider);

  if (existingPaths.length === 0) {
    return [];
  }

  // Create backup directory with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(targetDir, `${layout.backupDirPrefix}${timestamp}`);
  await ensureDirectory(backupDir);

  const backedUpPaths: string[] = [];

  for (const relativePath of existingPaths) {
    const fullPath = join(targetDir, relativePath);
    try {
      const backupPath = await backupExisting(fullPath, backupDir);
      backedUpPaths.push(backupPath);
      debug('install.backed_up', { from: relativePath, to: backupPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warn('install.backup_failed', { path: relativePath, error: message });
    }
  }

  return backedUpPaths.length > 0 ? [backupDir] : [];
}
