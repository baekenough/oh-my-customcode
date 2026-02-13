/**
 * Updater module - Update agents from source
 */

import { join } from 'node:path';
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
import { loadConfig, type OmccConfig, saveConfig } from './config.js';
import { mergeEntryDoc, wrapInManagedMarkers } from './entry-merger.js';
import { getProviderLayout } from './layout.js';

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
  result: UpdateResult,
  config: OmccConfig
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
    const preserved = await updateComponent(targetDir, component, customizations, options, config);
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
  result: UpdateResult,
  config: OmccConfig
): Promise<void> {
  for (const component of components) {
    await processComponentUpdate(
      targetDir,
      component,
      updateCheck,
      customizations,
      options,
      result,
      config
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

  // Validate each path for security
  const validatedPaths: string[] = [];
  for (const filePath of preserveFiles) {
    const validation = validatePreserveFilePath(filePath, options.targetDir);
    if (validation.valid) {
      validatedPaths.push(filePath);
    } else {
      warn('preserve_files.invalid_path', {
        path: filePath,
        reason: validation.reason ?? 'Invalid path',
      });
    }
  }

  return validatedPaths;
}

/**
 * Resolve customizations from manifest and config
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Security validation adds necessary complexity
function resolveCustomizations(
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

  // Only manifest has preserve files
  if (customizations) {
    customizations.preserveFiles = validatedManifestFiles;
    return customizations;
  }

  return null;
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

  const templateContent = await readTextFile(templatePath);

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

    // Load preservation config from BOTH sources
    const manifestCustomizations = await resolveManifestCustomizations(options, options.targetDir);
    const configPreserveFiles = resolveConfigPreserveFiles(options, config);
    const customizations = resolveCustomizations(
      manifestCustomizations,
      configPreserveFiles,
      options.targetDir
    );

    // Update all components
    const components = options.components || getAllUpdateComponents();
    await updateAllComponents(
      options.targetDir,
      components,
      updateCheck,
      customizations,
      options,
      result,
      config
    );

    // Update entry doc with merge (only on full update)
    if (!options.components || options.components.length === 0) {
      await updateEntryDoc(options.targetDir, config, options);
    }

    config.version = result.newVersion;
    config.lastUpdated = new Date().toISOString();
    await saveConfig(options.targetDir, config);

    result.success = true;

    if (result.previousVersion !== result.newVersion) {
      // Case 1: Version upgrade
      success('update.success', { from: result.previousVersion, to: result.newVersion });
    } else if (result.updatedComponents.length > 0) {
      // Case 2: Component sync within same version
      success('update.components_synced', {
        version: result.newVersion,
        components: result.updatedComponents.join(', '),
      });
    }
    // Case 3: No changes - already handled by early return at line 434-439
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
 * Update a single component
 */
async function updateComponent(
  targetDir: string,
  component: UpdateComponent,
  customizations: CustomizationManifest | null,
  options: UpdateOptions,
  config: OmccConfig
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

  // Normalize skipPaths to be relative to destPath
  const path = await import('node:path');
  const normalizedSkipPaths = skipPaths.map((p) => path.relative(destPath, join(targetDir, p)));

  // Update component with skipPaths
  await copyDirectory(srcPath, destPath, {
    overwrite: true,
    skipPaths: normalizedSkipPaths.length > 0 ? normalizedSkipPaths : undefined,
  });

  debug('update.component_updated', {
    component,
    skippedPaths: String(normalizedSkipPaths.length),
  });
  return preservedFiles;
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
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(targetDir, `.omcustom-backup-${timestamp}`);
  const fs = await import('node:fs/promises');

  await ensureDirectory(backupDir);

  // Backup key directories
  const layout = getProviderLayout();
  const dirsToBackup = [layout.rootDir, 'guides'];
  for (const dir of dirsToBackup) {
    const srcPath = join(targetDir, dir);
    if (await fileExists(srcPath)) {
      const destPath = join(backupDir, dir);
      await copyDirectory(srcPath, destPath, { overwrite: true });
    }
  }

  // Backup entry doc
  const entryPath = join(targetDir, layout.entryFile);
  if (await fileExists(entryPath)) {
    await fs.copyFile(entryPath, join(backupDir, layout.entryFile));
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
