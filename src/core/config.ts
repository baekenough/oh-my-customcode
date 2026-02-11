/**
 * Configuration management module
 */

import { join } from 'node:path';
import { ensureDirectory, fileExists, readJsonFile, writeJsonFile } from '../utils/fs.js';
import { debug, warn } from '../utils/logger.js';
import type { ProviderPreference } from './layout.js';

/**
 * Main configuration for oh-my-customcode
 */
export interface OmccConfig {
  /** Config file version */
  configVersion: number;
  /** Package version installed */
  version: string;
  /** User's preferred language */
  language: 'en' | 'ko';
  /** Preferred provider (auto|claude|codex) */
  provider?: ProviderPreference;
  /** Installation timestamp */
  installedAt: string;
  /** Last updated timestamp */
  lastUpdated: string;
  /** Installed components */
  installedComponents: string[];
  /** Component versions */
  componentVersions?: Record<string, string>;
  /** Agent configurations */
  agents?: Record<string, AgentConfig>;
  /** User preferences */
  preferences?: UserPreferences;
  /** Source repository for updates */
  sourceRepo?: string;
  /** Auto-update settings */
  autoUpdate?: AutoUpdateConfig;
  /** Files/directories to preserve during update */
  preserveFiles?: string[];
  /** Custom components not managed by omcustom */
  customComponents?: CustomComponentConfig[];
}

/**
 * Custom component configuration
 */
export interface CustomComponentConfig {
  /** Type of component */
  type: 'agent' | 'skill' | 'rule' | 'guide' | 'hook' | 'context';
  /** Component name */
  name: string;
  /** Relative path from project root */
  path: string;
  /** Always false - indicates this is custom, not managed by omcustom */
  managed: false;
}

/**
 * Configuration for individual agents
 */
export interface AgentConfig {
  /** Agent version */
  version: string;
  /** Source URL or "local" */
  source: string;
  /** Last updated timestamp */
  lastUpdated: string;
  /** Whether agent has local modifications */
  hasLocalModifications: boolean;
  /** Enabled status */
  enabled: boolean;
  /** Custom settings for this agent */
  settings?: Record<string, unknown>;
}

/**
 * User preferences
 */
export interface UserPreferences {
  /** Default log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Use colors in terminal output */
  colors: boolean;
  /** Show progress indicators */
  showProgress: boolean;
  /** Confirmation prompts */
  confirmPrompts: boolean;
  /** Backup before updates */
  autoBackup: boolean;
}

/**
 * Auto-update configuration
 */
export interface AutoUpdateConfig {
  /** Whether auto-update is enabled */
  enabled: boolean;
  /** Check frequency in hours */
  checkIntervalHours: number;
  /** Last check timestamp */
  lastCheck?: string;
  /** Auto-apply minor updates */
  autoApplyMinor: boolean;
  /** Components to auto-update */
  components?: string[];
}

/** Config file name */
const CONFIG_FILE = '.omcustomrc.json';

/** Current config version */
const CURRENT_CONFIG_VERSION = 1;

/**
 * Get the default configuration
 */
export function getDefaultConfig(): OmccConfig {
  return {
    configVersion: CURRENT_CONFIG_VERSION,
    version: '0.0.0',
    language: 'en',
    provider: 'auto',
    installedAt: '',
    lastUpdated: '',
    installedComponents: [],
    componentVersions: {},
    agents: {},
    preferences: getDefaultPreferences(),
    sourceRepo: 'https://github.com/baekenough/oh-my-customcode',
    autoUpdate: {
      enabled: false,
      checkIntervalHours: 24,
      autoApplyMinor: false,
    },
    preserveFiles: [],
    customComponents: [],
  };
}

/**
 * Get default user preferences
 */
export function getDefaultPreferences(): UserPreferences {
  return {
    logLevel: 'info',
    colors: true,
    showProgress: true,
    confirmPrompts: true,
    autoBackup: true,
  };
}

/**
 * Get the path to the config file
 */
export function getConfigPath(targetDir: string): string {
  return join(targetDir, CONFIG_FILE);
}

/**
 * Load configuration from target directory
 */
export async function loadConfig(targetDir: string): Promise<OmccConfig> {
  const configPath = getConfigPath(targetDir);

  if (await fileExists(configPath)) {
    try {
      const config = await readJsonFile<Partial<OmccConfig>>(configPath);
      const merged = mergeConfig(getDefaultConfig(), config);

      // Migrate if needed
      if (merged.configVersion < CURRENT_CONFIG_VERSION) {
        const migrated = migrateConfig(merged);
        await saveConfig(targetDir, migrated);
        return migrated;
      }

      return merged;
    } catch (err) {
      warn('config.load_failed', { error: String(err) });
      return getDefaultConfig();
    }
  }

  debug('config.not_found', { path: configPath });
  return getDefaultConfig();
}

/**
 * Save configuration to target directory
 */
export async function saveConfig(targetDir: string, config: OmccConfig): Promise<void> {
  const configPath = getConfigPath(targetDir);

  // Ensure directory exists
  await ensureDirectory(targetDir);

  // Update last updated timestamp
  config.lastUpdated = new Date().toISOString();

  await writeJsonFile(configPath, config);
  debug('config.saved', { path: configPath });
}

/**
 * Deduplicate custom components by path (later entries win)
 */
function deduplicateCustomComponents(components: CustomComponentConfig[]): CustomComponentConfig[] {
  const seen = new Map<string, CustomComponentConfig>();
  for (const c of components) {
    seen.set(c.path, c); // Later entries win (overrides take precedence)
  }
  return [...seen.values()];
}

/**
 * Merge configuration with defaults
 */
export function mergeConfig(defaults: OmccConfig, overrides: Partial<OmccConfig>): OmccConfig {
  return {
    ...defaults,
    ...overrides,
    preferences: overrides.preferences
      ? { ...defaults.preferences, ...overrides.preferences }
      : defaults.preferences,
    autoUpdate: overrides.autoUpdate
      ? { ...defaults.autoUpdate, ...overrides.autoUpdate }
      : defaults.autoUpdate,
    componentVersions: {
      ...defaults.componentVersions,
      ...overrides.componentVersions,
    },
    agents: {
      ...defaults.agents,
      ...overrides.agents,
    },
    preserveFiles: overrides.preserveFiles
      ? [...new Set([...(defaults.preserveFiles || []), ...overrides.preserveFiles])]
      : defaults.preserveFiles,
    customComponents: overrides.customComponents
      ? deduplicateCustomComponents([
          ...(defaults.customComponents || []),
          ...overrides.customComponents,
        ])
      : defaults.customComponents,
  };
}

/**
 * Migrate configuration to current version
 */
function migrateConfig(config: OmccConfig): OmccConfig {
  const migrated = { ...config };

  // Migration from version 0 to 1
  if (config.configVersion < 1) {
    migrated.configVersion = 1;
    migrated.preferences = getDefaultPreferences();
    migrated.autoUpdate = {
      enabled: false,
      checkIntervalHours: 24,
      autoApplyMinor: false,
    };
  }

  // Future migrations can be added here as needed

  migrated.configVersion = CURRENT_CONFIG_VERSION;
  return migrated;
}

/**
 * Update specific config values
 */
export async function updateConfig(
  targetDir: string,
  updates: Partial<OmccConfig>
): Promise<OmccConfig> {
  const current = await loadConfig(targetDir);
  const updated = mergeConfig(current, updates);
  await saveConfig(targetDir, updated);
  return updated;
}

/**
 * Get a specific config value
 */
export async function getConfigValue<K extends keyof OmccConfig>(
  targetDir: string,
  key: K
): Promise<OmccConfig[K]> {
  const config = await loadConfig(targetDir);
  return config[key];
}

/**
 * Set a specific config value
 */
export async function setConfigValue<K extends keyof OmccConfig>(
  targetDir: string,
  key: K,
  value: OmccConfig[K]
): Promise<void> {
  const config = await loadConfig(targetDir);
  config[key] = value;
  await saveConfig(targetDir, config);
}

/**
 * Check if config exists in target directory
 */
export async function configExists(targetDir: string): Promise<boolean> {
  const configPath = getConfigPath(targetDir);
  return fileExists(configPath);
}

/**
 * Delete config file
 */
export async function deleteConfig(targetDir: string): Promise<void> {
  const fs = await import('node:fs/promises');
  const configPath = getConfigPath(targetDir);

  if (await fileExists(configPath)) {
    await fs.unlink(configPath);
    debug('config.deleted', { path: configPath });
  }
}

/**
 * Get agent config
 */
export async function getAgentConfig(
  targetDir: string,
  agentName: string
): Promise<AgentConfig | undefined> {
  const config = await loadConfig(targetDir);
  return config.agents?.[agentName];
}

/**
 * Set agent config
 */
export async function setAgentConfig(
  targetDir: string,
  agentName: string,
  agentConfig: AgentConfig
): Promise<void> {
  const config = await loadConfig(targetDir);
  if (!config.agents) {
    config.agents = {};
  }
  config.agents[agentName] = agentConfig;
  await saveConfig(targetDir, config);
}

/**
 * Remove agent config
 */
export async function removeAgentConfig(targetDir: string, agentName: string): Promise<void> {
  const config = await loadConfig(targetDir);
  if (config.agents?.[agentName]) {
    delete config.agents[agentName];
    await saveConfig(targetDir, config);
  }
}

/**
 * Get all configured agents
 */
export async function getConfiguredAgents(targetDir: string): Promise<Record<string, AgentConfig>> {
  const config = await loadConfig(targetDir);
  return config.agents || {};
}

/**
 * Validate config structure
 */
export function validateConfig(config: unknown): config is OmccConfig {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  const c = config as Record<string, unknown>;

  return (
    typeof c.configVersion === 'number' &&
    typeof c.version === 'string' &&
    (c.language === 'en' || c.language === 'ko')
  );
}
