/**
 * Updater module - Update agents from source
 */

import { join } from 'node:path';
import {
  copyDirectory,
  ensureDirectory,
  fileExists,
  readJsonFile,
  resolveTemplatePath,
  writeJsonFile,
} from '../utils/fs.js';
import { debug, error, info, success } from '../utils/logger.js';
import { loadConfig, type OmccConfig, saveConfig } from './config.js';

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
  /** Dry run - show what would be updated without making changes */
  dryRun?: boolean;
  /** Whether to backup before updating */
  backup?: boolean;
}

/**
 * Components that can be updated
 */
export type UpdateComponent = 'rules' | 'agents' | 'skills' | 'guides' | 'hooks' | 'contexts';

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
  /** Files that were preserved (user customizations) */
  preservedFiles: string[];
  /** Backed up paths */
  backedUpPaths: string[];
  /** Previous version */
  previousVersion: string;
  /** New version */
  newVersion: string;
  /** Any warnings during update */
  warnings: string[];
  /** Error message if failed */
  error?: string;
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
interface CustomizationManifest {
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
  result: UpdateResult
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
    const preserved = await updateComponent(targetDir, component, customizations, options);
    result.updatedComponents.push(component);
    result.preservedFiles.push(...preserved);
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
  result: UpdateResult
): Promise<void> {
  for (const component of components) {
    await processComponentUpdate(
      targetDir,
      component,
      updateCheck,
      customizations,
      options,
      result
    );
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

    const updateCheck = await checkForUpdates(options.targetDir);
    result.newVersion = updateCheck.latestVersion;

    if (!updateCheck.hasUpdates && !options.force) {
      info('update.no_updates');
      result.success = true;
      result.skippedComponents = options.components || getAllUpdateComponents();
      return result;
    }

    await handleBackupIfRequested(options.targetDir, !!options.backup, result);

    const customizations =
      options.preserveCustomizations !== false
        ? await loadCustomizationManifest(options.targetDir)
        : null;

    const components = options.components || getAllUpdateComponents();
    await updateAllComponents(
      options.targetDir,
      components,
      updateCheck,
      customizations,
      options,
      result
    );

    config.version = result.newVersion;
    config.lastUpdated = new Date().toISOString();
    await saveConfig(options.targetDir, config);

    result.success = true;
    success('update.success', { from: result.previousVersion, to: result.newVersion });
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
  return ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts'];
}

/**
 * Get the latest version from package templates
 */
async function getLatestVersion(): Promise<string> {
  const manifestPath = resolveTemplatePath('manifest.json');
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
 * Update a single component
 */
async function updateComponent(
  targetDir: string,
  component: UpdateComponent,
  customizations: CustomizationManifest | null,
  options: UpdateOptions
): Promise<string[]> {
  const preservedFiles: string[] = [];
  const componentPath = getComponentPath(component);
  const srcPath = resolveTemplatePath(componentPath);
  const destPath = join(targetDir, componentPath);

  // Preserve customizations
  if (customizations && options.preserveCustomizations !== false) {
    const toPreserve = customizations.preserveFiles.filter((f) => f.startsWith(componentPath));
    if (toPreserve.length > 0) {
      const preserved = await preserveCustomizations(targetDir, toPreserve);
      preservedFiles.push(...preserved.keys());

      // Update component
      await copyDirectory(srcPath, destPath, { overwrite: true });

      // Restore preserved files
      const fs = await import('node:fs/promises');
      for (const [path, content] of preserved) {
        await fs.writeFile(join(targetDir, path), content, 'utf-8');
      }
    } else {
      await copyDirectory(srcPath, destPath, { overwrite: true });
    }
  } else {
    await copyDirectory(srcPath, destPath, { overwrite: true });
  }

  debug('update.component_updated', { component });
  return preservedFiles;
}

/**
 * Get the path for a component
 */
function getComponentPath(component: UpdateComponent): string {
  const paths: Record<UpdateComponent, string> = {
    rules: '.claude/rules',
    agents: '.claude/agents',
    skills: '.claude/skills',
    guides: 'guides',
    hooks: '.claude/hooks',
    contexts: '.claude/contexts',
  };
  return paths[component];
}

/**
 * Backup the current installation
 */
async function backupInstallation(targetDir: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(targetDir, `.omcustom-backup-${timestamp}`);
  const fs = await import('node:fs/promises');

  await ensureDirectory(backupDir);

  // Backup key directories
  const dirsToBackup = ['.claude', 'guides'];
  for (const dir of dirsToBackup) {
    const srcPath = join(targetDir, dir);
    if (await fileExists(srcPath)) {
      const destPath = join(backupDir, dir);
      await copyDirectory(srcPath, destPath, { overwrite: true });
    }
  }

  // Backup CLAUDE.md
  const claudeMdPath = join(targetDir, 'CLAUDE.md');
  if (await fileExists(claudeMdPath)) {
    await fs.copyFile(claudeMdPath, join(backupDir, 'CLAUDE.md'));
  }

  return backupDir;
}

/**
 * Load customization manifest
 */
async function loadCustomizationManifest(targetDir: string): Promise<CustomizationManifest | null> {
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
