/**
 * Installer module - Install/copy baekgom-agents templates
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

/**
 * Options for installation
 */
export interface InstallOptions {
  /** Target directory to install to */
  targetDir: string;
  /** Language for CLAUDE.md (en or ko) */
  language?: 'en' | 'ko';
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
 * Updated for official Claude Code format (commands absorbed into skills)
 */
export type InstallComponent =
  | 'claude-md'
  | 'rules'
  | 'agents'
  | 'skills'
  | 'guides'
  | 'pipelines'
  | 'hooks'
  | 'contexts';

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
 * Updated for official Claude Code format:
 * - .claude/agents/ is flat (no subdirectories)
 * - .claude/skills/ contains skill directories
 * - commands/ removed (absorbed into skills)
 */
const DIRECTORY_STRUCTURE = [
  '.claude',
  '.claude/rules',
  '.claude/hooks',
  '.claude/contexts',
  '.claude/agents',
  '.claude/skills',
  'guides',
  'pipelines',
  'pipelines/templates',
  'pipelines/examples',
] as const;

/**
 * Component to template path mapping
 * Updated for official Claude Code format
 */
const COMPONENT_PATHS: Record<InstallComponent, string> = {
  'claude-md': '',
  rules: '.claude/rules',
  agents: '.claude/agents',
  skills: '.claude/skills',
  guides: 'guides',
  pipelines: 'pipelines',
  hooks: '.claude/hooks',
  contexts: '.claude/contexts',
};

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
  shouldBackup: boolean,
  result: InstallResult
): Promise<void> {
  if (!shouldBackup) return;

  const backupPaths = await backupExistingInstallation(targetDir);
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
  force: boolean,
  backup: boolean,
  result: InstallResult
): Promise<void> {
  if (force || backup) return;

  const existingPaths = await checkExistingPaths(targetDir);
  if (existingPaths.length > 0) {
    warn('install.exists');
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
  options: InstallOptions,
  result: InstallResult
): Promise<void> {
  const components = options.components || getAllComponents();

  for (const component of components) {
    await installSingleComponent(targetDir, component, options, result);
  }
}

/**
 * Install a single component with error handling
 */
async function installSingleComponent(
  targetDir: string,
  component: InstallComponent,
  options: InstallOptions,
  result: InstallResult
): Promise<void> {
  try {
    const installed = await installComponent(targetDir, component, options);
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
 * Install CLAUDE.md and track result
 */
async function installClaudeMdWithTracking(
  targetDir: string,
  options: InstallOptions,
  result: InstallResult
): Promise<void> {
  const language = options.language || 'en';
  const overwrite = !!(options.force || options.backup);
  const installed = await installClaudeMd(targetDir, language, overwrite);

  if (installed) {
    result.installedComponents.push('claude-md');
  } else {
    result.skippedComponents.push('claude-md');
  }
}

/**
 * Update configuration after installation
 */
async function updateInstallConfig(
  targetDir: string,
  options: InstallOptions,
  installedComponents: InstallComponent[]
): Promise<void> {
  const config = await loadConfig(targetDir);
  config.language = options.language || 'en';
  config.installedAt = new Date().toISOString();
  config.installedComponents = installedComponents;
  await saveConfig(targetDir, config);
}

/**
 * Install oh-my-customcode templates to target directory
 */
export async function install(options: InstallOptions): Promise<InstallResult> {
  const result = createInstallResult(options.targetDir);

  try {
    info('install.start', { targetDir: options.targetDir });

    await ensureTargetDirectory(options.targetDir);
    await handleBackup(options.targetDir, !!options.backup, result);
    await checkAndWarnExisting(options.targetDir, !!options.force, !!options.backup, result);
    await verifyTemplateDirectory();

    await createDirectoryStructure(options.targetDir);
    debug('install.directories_created');

    await installAllComponents(options.targetDir, options, result);
    await installClaudeMdWithTracking(options.targetDir, options, result);
    await updateInstallConfig(options.targetDir, options, result.installedComponents);

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
export async function createDirectoryStructure(targetDir: string): Promise<void> {
  for (const dir of DIRECTORY_STRUCTURE) {
    const fullPath = join(targetDir, dir);
    await ensureDirectory(fullPath);
  }
}

/**
 * Get the template manifest
 */
export async function getTemplateManifest(): Promise<TemplateManifest> {
  const packageRoot = getPackageRoot();
  const manifestPath = join(packageRoot, 'templates', 'manifest.json');

  if (await fileExists(manifestPath)) {
    return readJsonFile<TemplateManifest>(manifestPath);
  }

  // Return default manifest if not found
  return {
    version: '0.0.0',
    lastUpdated: new Date().toISOString(),
    components: getAllComponents().map((name) => ({
      name,
      path: COMPONENT_PATHS[name],
      description: `${name} component`,
      files: 0,
    })),
    source: 'https://github.com/baekenough/baekgom-agents',
  };
}

/**
 * Get all available components
 * Updated: commands removed (absorbed into skills)
 */
function getAllComponents(): InstallComponent[] {
  return ['rules', 'agents', 'skills', 'guides', 'pipelines', 'hooks', 'contexts'];
}

/**
 * Install a single component
 */
async function installComponent(
  targetDir: string,
  component: InstallComponent,
  options: InstallOptions
): Promise<boolean> {
  const templatePath = COMPONENT_PATHS[component];
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
 * Install CLAUDE.md with the selected language
 */
async function installClaudeMd(
  targetDir: string,
  language: 'en' | 'ko',
  overwrite = false
): Promise<boolean> {
  const templateFile = `CLAUDE.md.${language}`;
  const srcPath = resolveTemplatePath(templateFile);
  const destPath = join(targetDir, 'CLAUDE.md');

  // Check if source template exists
  if (!(await fileExists(srcPath))) {
    warn('install.claude_md_not_found', { language, path: srcPath });
    return false;
  }

  // Check if destination exists and we're not overwriting
  const destExists = await fileExists(destPath);
  if (destExists && !overwrite) {
    debug('install.claude_md_skipped', { reason: 'exists', language });
    return false;
  }

  // Copy the template file to CLAUDE.md
  await fsCopyFile(srcPath, destPath);
  debug('install.claude_md_installed', { language });
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
 * Updated: paths now under .claude/ for official format
 */
async function checkExistingPaths(targetDir: string): Promise<string[]> {
  const pathsToCheck = ['CLAUDE.md', '.claude', 'guides', 'pipelines'];

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
async function backupExistingInstallation(targetDir: string): Promise<string[]> {
  const existingPaths = await checkExistingPaths(targetDir);

  if (existingPaths.length === 0) {
    return [];
  }

  // Create backup directory with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(targetDir, `.claude-backup-${timestamp}`);
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
