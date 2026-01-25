/**
 * Installer module - Install/copy baekgom-agents templates
 */

import { dirname, join } from 'node:path';
import {
  copyDirectory,
  ensureDirectory,
  fileExists,
  getPackageRoot,
  readJsonFile,
  resolveTemplatePath,
} from '../utils/fs.js';
import { debug, error, info, success, warn } from '../utils/logger.js';
import { type OmccConfig, loadConfig, saveConfig } from './config.js';

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
 */
export type InstallComponent =
  | 'claude-md'
  | 'rules'
  | 'agents'
  | 'skills'
  | 'guides'
  | 'pipelines'
  | 'commands'
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
 */
const DIRECTORY_STRUCTURE = [
  '.claude',
  '.claude/rules',
  '.claude/hooks',
  '.claude/contexts',
  'agents',
  'agents/master',
  'agents/orchestrator',
  'agents/manager',
  'agents/system',
  'agents/sw-engineer',
  'agents/sw-architect',
  'agents/backend-engineer',
  'agents/infra-engineer',
  'agents/qa-engineer',
  'agents/tutor',
  'skills',
  'skills/development',
  'skills/backend',
  'skills/infrastructure',
  'skills/system',
  'skills/orchestration',
  'guides',
  'pipelines',
  'pipelines/templates',
  'pipelines/examples',
  'commands',
] as const;

/**
 * Component to template path mapping
 */
const COMPONENT_PATHS: Record<InstallComponent, string> = {
  'claude-md': '',
  rules: '.claude/rules',
  agents: 'agents',
  skills: 'skills',
  guides: 'guides',
  pipelines: 'pipelines',
  commands: 'commands',
  hooks: '.claude/hooks',
  contexts: '.claude/contexts',
};

/**
 * Install oh-my-customcode templates to target directory
 */
export async function install(options: InstallOptions): Promise<InstallResult> {
  const result: InstallResult = {
    success: false,
    installedPath: options.targetDir,
    installedComponents: [],
    skippedComponents: [],
    backedUpPaths: [],
    warnings: [],
  };

  try {
    info('install.start', { targetDir: options.targetDir });

    // Check if target directory exists
    const targetExists = await fileExists(options.targetDir);
    if (!targetExists) {
      await ensureDirectory(options.targetDir);
    }

    // Check for existing .claude directory
    const claudeDir = join(options.targetDir, '.claude');
    const claudeExists = await fileExists(claudeDir);

    if (claudeExists && !options.force) {
      if (options.backup) {
        const backupPath = await backupExisting(claudeDir);
        result.backedUpPaths.push(backupPath);
        info('install.backup', { path: backupPath });
      } else {
        warn('install.exists');
        result.warnings.push(
          'Existing .claude/ directory found. Use --force to overwrite or --backup to backup first.'
        );
      }
    }

    // Create directory structure
    await createDirectoryStructure(options.targetDir);
    debug('install.directories_created');

    // Determine components to install
    const components = options.components || getAllComponents();

    // Copy templates for each component
    for (const component of components) {
      try {
        const installed = await installComponent(options.targetDir, component, options);
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

    // Install CLAUDE.md with selected language
    await installClaudeMd(options.targetDir, options.language || 'en');
    result.installedComponents.push('claude-md');

    // Update config
    const config = await loadConfig(options.targetDir);
    config.language = options.language || 'en';
    config.installedAt = new Date().toISOString();
    config.installedComponents = result.installedComponents;
    await saveConfig(options.targetDir, config);

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
  options?: { overwrite?: boolean }
): Promise<void> {
  const srcPath = resolveTemplatePath(templatePath);
  const destPath = join(targetDir, templatePath);

  await copyDirectory(srcPath, destPath, {
    overwrite: options?.overwrite ?? false,
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
 */
function getAllComponents(): InstallComponent[] {
  return ['rules', 'agents', 'skills', 'guides', 'pipelines', 'commands', 'hooks', 'contexts'];
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

  if (destExists && !options.force) {
    debug('install.component_skipped', { component });
    return false;
  }

  const srcPath = resolveTemplatePath(templatePath);
  if (!(await fileExists(srcPath))) {
    warn('install.template_not_found', { component, path: srcPath });
    return false;
  }

  await copyDirectory(srcPath, destPath, { overwrite: options.force ?? false });
  debug('install.component_installed', { component });
  return true;
}

/**
 * Install CLAUDE.md with the selected language
 */
async function installClaudeMd(targetDir: string, language: 'en' | 'ko'): Promise<void> {
  const templateFile = `CLAUDE.md.${language}`;
  const srcPath = resolveTemplatePath(templateFile);
  const destPath = join(targetDir, 'CLAUDE.md');

  if (await fileExists(srcPath)) {
    const fs = await import('node:fs/promises');
    await fs.copyFile(srcPath, destPath);
    debug('install.claude_md_installed', { language });
  } else {
    warn('install.claude_md_not_found', { language });
  }
}

/**
 * Backup existing directory
 */
async function backupExisting(path: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${path}.backup.${timestamp}`;
  const fs = await import('node:fs/promises');
  await fs.rename(path, backupPath);
  return backupPath;
}
