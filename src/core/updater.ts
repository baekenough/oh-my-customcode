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
import { isProtectedFile } from './file-preservation.js';
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
export type UpdateComponent =
  | 'rules'
  | 'agents'
  | 'skills'
  | 'guides'
  | 'hooks'
  | 'contexts'
  | 'ontology';

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
  /** Root-level files that were synced */
  syncedRootFiles: string[];
  /** Deprecated files that were removed */
  removedDeprecatedFiles: string[];
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
    syncedRootFiles: [],
    removedDeprecatedFiles: [],
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

  // Paths are already validated by mergeConfig (called with targetDir during loadConfig)
  const validatedPaths: string[] = [];
  for (const filePath of preserveFiles) {
    validatedPaths.push(filePath);
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

  // Only manifest has preserve files.
  // customizations is guaranteed non-null here: validatedManifestFiles.length > 0
  // only when customizations was truthy in the population loop above.
  // biome-ignore lint/style/noNonNullAssertion: logically guaranteed non-null (see comment)
  customizations!.preserveFiles = validatedManifestFiles;
  return customizations;
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
 * Handle full-update-only post-processing steps and log success
 */
async function runFullUpdatePostProcessing(
  options: UpdateOptions,
  result: UpdateResult,
  config: OmccConfig
): Promise<void> {
  const isFullUpdate = !options.components || options.components.length === 0;

  if (isFullUpdate) {
    const synced = await syncRootLevelFiles(options.targetDir, options);
    result.syncedRootFiles = synced;

    const removed = await removeDeprecatedFiles(options.targetDir, options);
    result.removedDeprecatedFiles = removed;

    if (!options.dryRun) {
      await updateEntryDoc(options.targetDir, config, options);
    }
  }

  if (!options.dryRun) {
    config.version = result.newVersion;
    config.lastUpdated = new Date().toISOString();
    await saveConfig(options.targetDir, config);
  }

  result.success = true;

  if (result.previousVersion !== result.newVersion) {
    success('update.success', { from: result.previousVersion, to: result.newVersion });
  } else if (result.updatedComponents.length > 0) {
    success('update.components_synced', {
      version: result.newVersion,
      components: result.updatedComponents.join(', '),
    });
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

    await runFullUpdatePostProcessing(options, result, config);
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
  return ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts', 'ontology'];
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
 * Collect the protected file paths within a component's source directory.
 * Returns paths normalized relative to destPath for use with skipPaths.
 */
async function collectProtectedSkipPaths(
  srcPath: string,
  destPath: string,
  componentPath: string,
  forceOverwriteAll: boolean
): Promise<{ skipPaths: string[]; warnedPaths: string[] }> {
  if (forceOverwriteAll) {
    // forceOverwriteAll: still warn but do NOT skip
    const warnedPaths = await findProtectedFilesInDir(srcPath, componentPath);
    return { skipPaths: [], warnedPaths };
  }

  const protectedRelative = await findProtectedFilesInDir(srcPath, componentPath);
  const path = await import('node:path');
  const skipPaths = protectedRelative.map((p) => path.relative(destPath, join(destPath, p)));
  return { skipPaths, warnedPaths: protectedRelative };
}

/**
 * Check if a directory entry's relative path matches a protected-file rule,
 * considering both the bare relative path and the component-prefixed path.
 */
function isEntryProtected(relPath: string, componentRelativePrefix: string): boolean {
  if (isProtectedFile(relPath)) {
    return true;
  }
  const componentPrefixed = componentRelativePrefix
    ? `${componentRelativePrefix}/${relPath}`
    : relPath;
  return isProtectedFile(componentPrefixed);
}

/**
 * Read directory entries, returning an empty array on error (e.g. directory not found).
 */
async function safeReaddir(
  dir: string,
  fs: typeof import('node:fs/promises')
): Promise<import('node:fs').Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Walk a component source directory and return paths (relative to the component root)
 * of any files that match the protected-file rules.
 */
async function findProtectedFilesInDir(
  dirPath: string,
  componentRelativePrefix: string
): Promise<string[]> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  // Iterative BFS walk to avoid recursive async function complexity
  const protected_: string[] = [];
  const queue: Array<{ dir: string; relDir: string }> = [{ dir: dirPath, relDir: '' }];

  while (queue.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: queue.length > 0 guarantees shift() returns a value
    const { dir, relDir } = queue.shift()!;
    const entries = await safeReaddir(dir, fs);

    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        queue.push({ dir: fullPath, relDir: relPath });
      } else if (entry.isFile() && isEntryProtected(relPath, componentRelativePrefix)) {
        protected_.push(relPath);
      }
    }
  }

  return protected_;
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

  // Collect protected framework/rule files that must not be silently overwritten
  const { skipPaths: protectedSkipPaths, warnedPaths: protectedWarnedPaths } =
    await collectProtectedSkipPaths(srcPath, destPath, componentPath, !!options.forceOverwriteAll);

  for (const protectedPath of protectedWarnedPaths) {
    if (options.forceOverwriteAll) {
      warn('update.protected_file_force_overwrite', {
        file: protectedPath,
        component,
        hint: 'File contains AI behavioral constraints. Overwriting because --force-overwrite-all was set.',
      });
    } else {
      warn('update.protected_file_skipped', {
        file: protectedPath,
        component,
        hint: 'File contains AI behavioral constraints and was not updated. Use --force-overwrite-all to override.',
      });
    }
  }

  // Merge protected skip paths with the existing skip paths (dedup)
  skipPaths.push(...protectedSkipPaths);

  // Normalize skipPaths to be relative to destPath
  const path = await import('node:path');
  const normalizedSkipPaths = skipPaths.map((p) => path.relative(destPath, join(targetDir, p)));

  // Deduplicate after normalization
  const uniqueSkipPaths = [...new Set(normalizedSkipPaths)];

  // Update component with skipPaths
  await copyDirectory(srcPath, destPath, {
    overwrite: true,
    skipPaths: uniqueSkipPaths.length > 0 ? uniqueSkipPaths : undefined,
  });

  debug('update.component_updated', {
    component,
    skippedPaths: String(uniqueSkipPaths.length),
    protectedSkipped: String(protectedSkipPaths.length),
  });
  return preservedFiles;
}

/**
 * Root-level files in .claude/ that should be synced during update
 * These are files that exist directly under templates/.claude/ (not in subdirectories)
 */
const ROOT_LEVEL_FILES = ['statusline.sh', 'install-hooks.sh', 'uninstall-hooks.sh'];

/**
 * Sync root-level files from templates/.claude/ to target .claude/ directory
 * These files don't belong to any component subdirectory.
 */
async function syncRootLevelFiles(targetDir: string, options: UpdateOptions): Promise<string[]> {
  if (options.dryRun) {
    return ROOT_LEVEL_FILES;
  }

  const fs = await import('node:fs/promises');
  const layout = getProviderLayout();
  const synced: string[] = [];

  for (const fileName of ROOT_LEVEL_FILES) {
    const srcPath = resolveTemplatePath(join(layout.rootDir, fileName));

    if (!(await fileExists(srcPath))) {
      continue;
    }

    const destPath = join(targetDir, layout.rootDir, fileName);
    await ensureDirectory(join(destPath, '..'));
    await fs.copyFile(srcPath, destPath);

    // Preserve execute permissions for shell scripts
    if (fileName.endsWith('.sh')) {
      await fs.chmod(destPath, 0o755);
    }

    synced.push(fileName);
  }

  if (synced.length > 0) {
    debug('update.root_files_synced', { files: synced.join(', ') });
  }

  return synced;
}

/**
 * Deprecated file entry in the manifest
 */
interface DeprecatedFileEntry {
  /** Relative path to the deprecated file */
  path: string;
  /** Reason for deprecation */
  reason: string;
  /** Version since which the file was deprecated */
  since: string;
}

/**
 * Deprecated files manifest
 */
interface DeprecatedFilesManifest {
  description: string;
  files: DeprecatedFileEntry[];
}

/**
 * Remove deprecated files from the target directory.
 * Reads templates/deprecated-files.json and removes listed files if they exist.
 */
async function removeDeprecatedFiles(targetDir: string, options: UpdateOptions): Promise<string[]> {
  const manifestPath = resolveTemplatePath('deprecated-files.json');

  if (!(await fileExists(manifestPath))) {
    return [];
  }

  const manifest = await readJsonFile<DeprecatedFilesManifest>(manifestPath);

  if (!manifest.files || manifest.files.length === 0) {
    return [];
  }

  if (options.dryRun) {
    return manifest.files.map((f) => f.path);
  }

  const fs = await import('node:fs/promises');
  const removed: string[] = [];

  for (const entry of manifest.files) {
    // Security: validate path is within targetDir
    const validation = validatePreserveFilePath(entry.path, targetDir);
    if (!validation.valid) {
      warn('update.deprecated_file_invalid_path', {
        path: entry.path,
        reason: validation.reason ?? 'Invalid path',
      });
      continue;
    }

    const fullPath = join(targetDir, entry.path);
    if (await fileExists(fullPath)) {
      await fs.unlink(fullPath);
      removed.push(entry.path);
      info('update.deprecated_file_removed', {
        path: entry.path,
        reason: entry.reason,
      });
    }
  }

  if (removed.length > 0) {
    debug('update.deprecated_files_cleaned', { count: String(removed.length) });
  }

  return removed;
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
