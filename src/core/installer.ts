/**
 * Installer module - Install/copy templates
 */

import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  readdir,
  rename,
  stat,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  copyDirectory,
  copyFile,
  ensureDirectory,
  fileExists,
  getPackageRoot,
  readJsonFile,
  readTextFile,
  resolveTemplatePath,
  writeJsonFile,
  writeTextFile,
} from '../utils/fs.js';
import { debug, error, info, success, warn } from '../utils/logger.js';
import { installCodex, isCodexInstalled } from './codex-installer.js';
import { loadConfig, saveConfig } from './config.js';
import {
  cleanupPreservation,
  extractCriticalFiles,
  type PreservationResult,
  restoreCriticalFiles,
} from './file-preservation.js';
import {
  detectGitWorkflow,
  getDefaultWorkflow,
  renderGitWorkflowEN,
  renderGitWorkflowKO,
} from './git-workflow.js';
import { migrateHookCommands, NEW_STATUSLINE_COMMAND } from './hook-command-migration.js';
import { mergeHooksIntoSettings } from './hooks-settings.js';
import {
  getComponentPath,
  getEntryTemplateName,
  getProviderLayout,
  type InstallComponent,
} from './layout.js';
import { generateAndWriteLockfileForDir } from './lockfile.js';
import { installRtk, isRtkInstalled } from './rtk-installer.js';
import {
  getAgentDomain,
  getSkillScope,
  shouldInstallAgent,
  shouldInstallSkill,
} from './scope-filter.js';

/**
 * Options for installation
 */
export interface InstallOptions {
  /** Target directory to install to */
  targetDir: string;
  /** Language for entry doc (en or ko) */
  language?: 'en' | 'ko';
  /** Whether to overwrite existing files */
  force?: boolean;
  /** Whether to backup existing files before overwriting */
  backup?: boolean;
  /** Specific components to install (default: all) */
  components?: InstallComponent[];
  /** Skip confirmation prompts */
  skipConfirm?: boolean;
  /**
   * Install only agents whose domain matches this value.
   * Universal agents are always installed regardless of this filter.
   * When undefined, all agents are installed (backward compatible).
   */
  domain?: string;
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
  shouldBackup: boolean,
  result: InstallResult
): Promise<PreservationResult | null> {
  if (!shouldBackup) return null;

  const layout = getProviderLayout();
  const rootDir = join(targetDir, layout.rootDir);

  // Extract critical user files BEFORE backup moves .claude/ away
  let preservation: PreservationResult | null = null;
  if (await fileExists(rootDir)) {
    const { createTempDir } = await import('../utils/fs.js');
    const tempDir = await createTempDir('omcustom-preserve-');
    preservation = await extractCriticalFiles(rootDir, tempDir);

    if (preservation.extractedFiles.length > 0 || preservation.extractedDirs.length > 0) {
      info('install.preserved', {
        files: String(preservation.extractedFiles.length),
        dirs: String(preservation.extractedDirs.length),
      });
    }
  }

  const backupPaths = await backupExistingInstallation(targetDir);
  result.backedUpPaths.push(...backupPaths);
  if (backupPaths.length > 0) {
    info('install.backup', { path: backupPaths[0] });
  }

  return preservation;
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
    const layout = getProviderLayout();
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
 * Install statusline.sh to the target directory and make it executable
 */
async function installStatusline(
  targetDir: string,
  options: InstallOptions,
  _result: InstallResult
): Promise<void> {
  const layout = getProviderLayout();
  const srcPath = resolveTemplatePath(join(layout.rootDir, 'statusline.sh'));
  const destPath = join(targetDir, layout.rootDir, 'statusline.sh');

  if (!(await fileExists(srcPath))) {
    debug('install.statusline_not_found', { path: srcPath });
    return;
  }

  if (await fileExists(destPath)) {
    if (!options.force && !options.backup) {
      debug('install.statusline_skipped', { reason: 'exists' });
      return;
    }
  }

  await copyFile(srcPath, destPath);

  const fs = await import('node:fs/promises');
  await fs.chmod(destPath, 0o755);

  debug('install.statusline_installed', {});
}

/**
 * Install schemas/tool-inputs.json to the target directory (#1770).
 *
 * The shipped schema-validator hook reads `.claude/schemas/tool-inputs.json` and silently
 * no-ops when it is missing, so it must reach user projects. The updater keeps it in sync
 * via ROOT_LEVEL_FILES; this covers `omcustom init`. Existing-file semantics mirror
 * installStatusline: kept unless `force` or `backup` is set.
 */
async function installSchemas(
  targetDir: string,
  options: InstallOptions,
  _result: InstallResult
): Promise<void> {
  const layout = getProviderLayout();
  const relPath = join(layout.rootDir, 'schemas', 'tool-inputs.json');
  const srcPath = resolveTemplatePath(relPath);
  const destPath = join(targetDir, relPath);

  if (!(await fileExists(srcPath))) {
    debug('install.schemas_not_found', { path: srcPath });
    return;
  }

  if (await fileExists(destPath)) {
    if (!options.force && !options.backup) {
      debug('install.schemas_skipped', { reason: 'exists' });
      return;
    }
  }

  await ensureDirectory(dirname(destPath));
  await copyFile(srcPath, destPath);
  debug('install.schemas_installed', {});
}

/**
 * Install tests/tsconfig.json to the target directory
 */
async function installTestsConfig(
  targetDir: string,
  options: InstallOptions,
  _result: InstallResult
): Promise<void> {
  const srcPath = resolveTemplatePath(join('tests', 'tsconfig.json'));
  const destPath = join(targetDir, 'tests', 'tsconfig.json');

  if (!(await fileExists(srcPath))) {
    debug('install.tests_config_not_found', { path: srcPath });
    return;
  }

  if (await fileExists(destPath)) {
    if (!options.force && !options.backup) {
      debug('install.tests_config_skipped', { reason: 'exists' });
      return;
    }
  }

  await copyFile(srcPath, destPath);
  debug('install.tests_config_installed', {});
}

/** Default refreshInterval (seconds) backfilled into an existing statusLine. */
const STATUSLINE_REFRESH_INTERVAL = 10;

/**
 * Update the statusLine of an existing settings.local.json object in place:
 * re-anchor the exact old default command only (#1769, custom commands are untouched) and
 * backfill a missing refreshInterval. Reports which changes were applied.
 */
function updateExistingStatusLine(existing: Record<string, unknown>): {
  commandMigrated: boolean;
  refreshIntervalAdded: boolean;
} {
  const migrated = migrateHookCommands({ statusLine: existing.statusLine });
  const commandMigrated = migrated.rewritten > 0;
  if (commandMigrated) {
    existing.statusLine = migrated.settings.statusLine;
  }
  const sl = existing.statusLine as Record<string, unknown>;
  const refreshIntervalAdded = sl.refreshInterval === undefined;
  if (refreshIntervalAdded) {
    sl.refreshInterval = STATUSLINE_REFRESH_INTERVAL;
  }
  return { commandMigrated, refreshIntervalAdded };
}

/**
 * Merge the statusLine configuration into an existing, parsed settings.local.json
 * (adds a missing statusLine; otherwise re-anchors the exact old default and backfills
 * refreshInterval) and write the file back only when something changed.
 */
async function mergeStatusLineIntoExisting(
  settingsPath: string,
  existing: Record<string, unknown>,
  defaults: { statusLine: Record<string, unknown> }
): Promise<void> {
  if (!existing.statusLine) {
    existing.statusLine = defaults.statusLine;
    await writeJsonFile(settingsPath, existing);
    debug('install.settings_local_merged', {});
    return;
  }

  const { commandMigrated, refreshIntervalAdded } = updateExistingStatusLine(existing);
  if (!commandMigrated && !refreshIntervalAdded) {
    debug('install.settings_local_skipped', { reason: 'statusLine exists' });
    return;
  }

  await writeJsonFile(settingsPath, existing);
  if (commandMigrated) {
    debug('install.settings_local_statusline_migrated', {});
  }
  if (refreshIntervalAdded) {
    debug('install.settings_local_refreshInterval_added', {});
  }
}

/**
 * Create or merge settings.local.json with statusLine configuration
 */
async function installSettingsLocal(targetDir: string, result: InstallResult): Promise<void> {
  const layout = getProviderLayout();
  const settingsPath = join(targetDir, layout.rootDir, 'settings.local.json');

  const statusLineConfig = {
    statusLine: {
      type: 'command' as const,
      command: NEW_STATUSLINE_COMMAND,
      padding: 0,
      refreshInterval: STATUSLINE_REFRESH_INTERVAL,
    },
  };

  if (await fileExists(settingsPath)) {
    try {
      const existing = await readJsonFile<Record<string, unknown>>(settingsPath);
      await mergeStatusLineIntoExisting(settingsPath, existing, statusLineConfig);
    } catch {
      result.warnings.push(
        'Failed to parse existing settings.local.json, skipping statusLine config'
      );
    }
    return;
  }

  await writeJsonFile(settingsPath, statusLineConfig);
  debug('install.settings_local_created', {});
}

/**
 * Merge hooks.json wiring into settings.local.json (#1623).
 *
 * `.claude/hooks/hooks.json` is a human-readable declarative source, not a path CC
 * actually loads hooks from (see hook-wiring-research.md §A/§B). CC only recognizes
 * the `hooks` key inside `settings.json` / `settings.local.json`. Without this step,
 * every hook in `hooks.json` is copied to disk but never fires for end users running
 * `omcustom init`.
 *
 * Merge policy: opts into `preserveUserHooks` — the omcustom-owned hook groups (recognized
 * by group description or by standalone calls of shipped `.claude/hooks/*.sh` scripts, see
 * hook-group-merge.ts) are replaced by the freshly generated ones, while the user's own hook
 * groups/events and every other settings key survive. An existing settings.local.json that
 * cannot be parsed is left byte-identical and a warning is returned instead (#1768).
 *
 * Skipped when the hooks component was not installed (hooks.json absent at the
 * target path) — e.g. `--components` excludes `hooks`, or the hooks template is
 * missing from this package build.
 */
async function installHooksSettings(
  targetDir: string,
  _options: InstallOptions,
  result: InstallResult
): Promise<void> {
  const layout = getProviderLayout();
  const hooksJsonPath = join(targetDir, getComponentPath('hooks'), 'hooks.json');
  const settingsPath = join(targetDir, layout.rootDir, 'settings.local.json');

  if (!(await fileExists(hooksJsonPath))) {
    debug('install.hooks_settings_skipped', { reason: 'hooks.json not installed' });
    return;
  }

  try {
    const mergeResult = await mergeHooksIntoSettings(settingsPath, hooksJsonPath, {
      preserveUserHooks: true,
    });
    if (mergeResult && Array.isArray(mergeResult.warnings) && mergeResult.warnings.length > 0) {
      result.warnings.push(...mergeResult.warnings);
    }
    debug('install.hooks_settings_merged', {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.warnings.push(`Failed to merge hooks into settings.local.json: ${message}`);
    warn('install.hooks_settings_failed', { error: message });
  }
}

/** UTF-8 byte order mark, as decoded by readFile(..., 'utf-8'). */
const BOM = '\uFEFF';

/**
 * Re-anchor cwd-relative omcustom hook commands in settings.local.json after the
 * `--backup` restore step (#1767).
 *
 * restoreCriticalFiles() deep-merges the user's OLD settings.local.json over the freshly
 * written one with preserved values winning and arrays replaced, so per-event hook arrays
 * from the old file bring back old relative commands. Rewrite-only: nothing is added or
 * removed, and the file is written back only when at least one command changed.
 */
export async function migrateRestoredHookCommands(
  targetDir: string,
  result: InstallResult
): Promise<void> {
  const layout = getProviderLayout();
  const settingsPath = join(targetDir, layout.rootDir, 'settings.local.json');

  if (!(await fileExists(settingsPath))) {
    return;
  }

  try {
    const raw = await readTextFile(settingsPath);
    // Strip a leading UTF-8 BOM before parsing (JSON.parse rejects it), and re-emit the same
    // byte-order mark and trailing newline on write so the file keeps its original conventions.
    const hasBom = raw.startsWith(BOM);
    const trailingNewline = raw.endsWith('\n') ? '\n' : '';
    const current = JSON.parse(hasBom ? raw.slice(BOM.length) : raw) as Record<string, unknown>;
    const { settings, rewritten } = migrateHookCommands(current);
    if (rewritten > 0) {
      const body = `${JSON.stringify(settings, null, 2)}${trailingNewline}`;
      await writeTextFile(settingsPath, hasBom ? `${BOM}${body}` : body);
      debug('install.hook_commands_migrated', { rewritten: String(rewritten) });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.warnings.push(`Failed to migrate hook commands in settings.local.json: ${message}`);
    warn('install.hook_commands_migration_failed', { error: message });
  }
}

/**
 * Install entry doc and track result
 */
async function installEntryDocWithTracking(
  targetDir: string,
  options: InstallOptions,
  result: InstallResult
): Promise<void> {
  const language = options.language ?? DEFAULT_LANGUAGE;
  const overwrite = !!(options.force || options.backup);
  const installed = await installEntryDoc(targetDir, language, overwrite);

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
  options: InstallOptions,
  installedComponents: InstallComponent[]
): Promise<void> {
  const config = await loadConfig(targetDir);
  const manifest = await getTemplateManifest();
  config.version = manifest.version;
  config.language = options.language ?? DEFAULT_LANGUAGE;
  config.domain = options.domain;
  config.installedAt = new Date().toISOString();
  config.installedComponents = installedComponents;
  await saveConfig(targetDir, config);
}

/**
 * Install RTK if not already installed, adding warnings to result on failure
 */
function installRtkIfNeeded(result: InstallResult): void {
  if (!isRtkInstalled()) {
    info('install.rtk_installing');
    const rtkInstalled = installRtk();
    if (rtkInstalled) {
      info('install.rtk_success');
    } else {
      result.warnings.push(
        'RTK installation failed — install manually: brew install rtk-ai/tap/rtk'
      );
    }
  } else {
    info('install.rtk_already');
  }
}

/**
 * Install Codex CLI if not already installed, adding warnings to result on failure
 */
function installCodexIfNeeded(result: InstallResult): void {
  if (!isCodexInstalled()) {
    info('install.codex_installing');
    const codexInstalled = installCodex();
    if (codexInstalled) {
      info('install.codex_success');
    } else {
      result.warnings.push(
        'Codex CLI installation failed — install manually: npm install -g @openai/codex'
      );
    }
  } else {
    info('install.codex_already');
  }
}

/**
 * Install oh-my-customcode templates to target directory
 */
export async function install(options: InstallOptions): Promise<InstallResult> {
  const result = createInstallResult(options.targetDir);

  try {
    info('install.start', { targetDir: options.targetDir });

    await ensureTargetDirectory(options.targetDir);
    const preservation = await handleBackup(options.targetDir, !!options.backup, result);
    await checkAndWarnExisting(options.targetDir, !!options.force, !!options.backup, result);
    await verifyTemplateDirectory();

    await installAllComponents(options.targetDir, options, result);
    await installStatusline(options.targetDir, options, result);
    await installSchemas(options.targetDir, options, result);
    await installTestsConfig(options.targetDir, options, result);
    await installSettingsLocal(options.targetDir, result);
    await installHooksSettings(options.targetDir, options, result);
    await installEntryDocWithTracking(options.targetDir, options, result);

    // Restore critical user files AFTER installation
    if (preservation) {
      const layout = getProviderLayout();
      const rootDir = join(options.targetDir, layout.rootDir);
      const restoration = await restoreCriticalFiles(rootDir, preservation);

      if (restoration.restoredFiles.length > 0 || restoration.restoredDirs.length > 0) {
        info('install.restored', {
          files: String(restoration.restoredFiles.length),
          dirs: String(restoration.restoredDirs.length),
        });
      }

      if (restoration.failures.length > 0) {
        for (const failure of restoration.failures) {
          result.warnings.push(`Failed to restore ${failure.path}: ${failure.reason}`);
        }
      }

      await migrateRestoredHookCommands(options.targetDir, result);

      await cleanupPreservation(preservation.tempDir);
    }

    await updateInstallConfig(options.targetDir, options, result.installedComponents);

    // Generate lockfile for three-way merge support (#316)
    const lockfileResult = await generateAndWriteLockfileForDir(options.targetDir);
    if (lockfileResult.warning) {
      result.warnings.push(lockfileResult.warning);
      warn('install.lockfile_failed', { error: lockfileResult.warning });
    } else {
      info('install.lockfile_generated', { files: String(lockfileResult.fileCount) });
    }

    // Install RTK for token optimization
    installRtkIfNeeded(result);

    // Install Codex CLI for AI-assisted development
    installCodexIfNeeded(result);

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
  const layout = getProviderLayout();
  for (const dir of layout.directoryStructure) {
    const fullPath = join(targetDir, dir);
    await ensureDirectory(fullPath);
  }
}

/**
 * Get the template manifest
 */
export async function getTemplateManifest(): Promise<TemplateManifest> {
  const packageRoot = getPackageRoot();
  const layout = getProviderLayout();
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
      path: getComponentPath(name),
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
  return ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts', 'ontology'];
}

/**
 * Install skills directory with scope-based filtering.
 * Skills with scope: package are excluded from installation.
 */
async function installSkillsWithScopeFilter(
  srcPath: string,
  destPath: string,
  options: InstallOptions
): Promise<void> {
  await ensureDirectory(destPath);
  const entries = await readdir(srcPath);

  for (const entry of entries) {
    const entrySrcPath = join(srcPath, entry);
    if (!(await stat(entrySrcPath)).isDirectory()) continue;

    const skillMdPath = join(entrySrcPath, 'SKILL.md');
    if (await fileExists(skillMdPath)) {
      const content = await fsReadFile(skillMdPath, 'utf-8');
      const scope = getSkillScope(content);
      if (!shouldInstallSkill(scope)) {
        debug('install.skill_scope_excluded', { skill: entry, scope });
        continue;
      }
    }

    await copyDirectory(entrySrcPath, join(destPath, entry), {
      overwrite: !!(options.force || options.backup),
      preserveSymlinks: true,
      preserveTimestamps: true,
    });
  }
}

/**
 * Install agents directory with domain-based filtering.
 * When a domain filter is set, agents whose domain does not match and is not 'universal'
 * are excluded. When no domain filter is set, all agents are installed (backward compatible).
 */
async function installAgentsWithDomainFilter(
  srcPath: string,
  destPath: string,
  options: InstallOptions
): Promise<void> {
  await ensureDirectory(destPath);
  const entries = await readdir(srcPath);

  for (const entry of entries) {
    const entrySrcPath = join(srcPath, entry);
    const entryStat = await stat(entrySrcPath);

    // Handle subdirectories (e.g., souls/) by copying them as-is
    if (entryStat.isDirectory()) {
      await copyDirectory(entrySrcPath, join(destPath, entry), {
        overwrite: !!(options.force || options.backup),
        preserveSymlinks: true,
        preserveTimestamps: true,
      });
      continue;
    }

    if (!entry.endsWith('.md')) continue;

    if (options.domain) {
      const content = await fsReadFile(entrySrcPath, 'utf-8');
      const agentDomain = getAgentDomain(content);
      if (!shouldInstallAgent(agentDomain, options.domain)) {
        debug('install.agent_domain_excluded', { agent: entry, domain: agentDomain });
        continue;
      }
    }

    await copyFile(entrySrcPath, join(destPath, entry));
  }
}

/**
 * Install a single component
 */
async function installComponent(
  targetDir: string,
  component: InstallComponent,
  options: InstallOptions
): Promise<boolean> {
  if (component === 'entry-md') {
    return false;
  }

  const templatePath = getComponentPath(component);
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

  if (component === 'skills') {
    await installSkillsWithScopeFilter(srcPath, destPath, options);
  } else if (component === 'agents') {
    await installAgentsWithDomainFilter(srcPath, destPath, options);
  } else {
    // Copy with symlink preservation for refs/ directories
    await copyDirectory(srcPath, destPath, {
      overwrite: !!(options.force || options.backup),
      preserveSymlinks: true,
      preserveTimestamps: true,
    });
  }
  debug('install.component_installed', { component });
  return true;
}

/** Placeholder in entry doc templates replaced with detected git workflow */
const GIT_WORKFLOW_PLACEHOLDER = '<!-- omcustom:git-workflow -->';

/**
 * Render the git workflow section for the detected workflow and language
 */
function renderGitWorkflowSection(targetDir: string, language: 'en' | 'ko'): string {
  const result = detectGitWorkflow(targetDir) ?? getDefaultWorkflow();
  return language === 'ko' ? renderGitWorkflowKO(result) : renderGitWorkflowEN(result);
}

/**
 * Install entry doc with the selected language
 *
 * Reads the template, injects dynamic git workflow section, and writes to target.
 */
async function installEntryDoc(
  targetDir: string,
  language: 'en' | 'ko',
  overwrite = false
): Promise<boolean> {
  const layout = getProviderLayout();
  const templateFile = getEntryTemplateName(language);
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

  // Read template, inject git workflow, write to destination
  let content = await fsReadFile(srcPath, 'utf-8');

  if (content.includes(GIT_WORKFLOW_PLACEHOLDER)) {
    const workflowSection = renderGitWorkflowSection(targetDir, language);
    content = content.replace(GIT_WORKFLOW_PLACEHOLDER, workflowSection);
  }

  await fsWriteFile(destPath, content, 'utf-8');
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
async function checkExistingPaths(targetDir: string): Promise<string[]> {
  const layout = getProviderLayout();
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
async function backupExistingInstallation(targetDir: string): Promise<string[]> {
  const layout = getProviderLayout();
  const existingPaths = await checkExistingPaths(targetDir);

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
