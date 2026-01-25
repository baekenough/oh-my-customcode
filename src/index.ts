/**
 * oh-my-customcode - Batteries-included agent harness for Claude Code
 *
 * Main library entry point - exports public API
 */

// Core modules
export {
  type InstallOptions,
  type InstallResult,
  type TemplateManifest,
  install,
  copyTemplates,
  createDirectoryStructure,
  getTemplateManifest,
} from './core/installer.js';

export {
  type UpdateOptions,
  type UpdateResult,
  type UpdateCheckResult,
  type AgentVersion,
  update,
  checkForUpdates,
  applyUpdates,
  preserveCustomizations,
} from './core/updater.js';

export {
  type OmccConfig,
  type AgentConfig,
  loadConfig,
  saveConfig,
  getConfigPath,
  getDefaultConfig,
  mergeConfig,
} from './core/config.js';

// Utilities
export {
  type CopyOptions,
  copyDirectory,
  ensureDirectory,
  fileExists,
  readJsonFile,
  writeJsonFile,
  getPackageRoot,
  resolveTemplatePath,
} from './utils/fs.js';

export {
  type LogLevel,
  type LoggerOptions,
  createLogger,
  setLogLevel,
  setLocale,
  info,
  warn,
  error,
  debug,
  success,
} from './utils/logger.js';

// Version
export const VERSION = '0.0.0';

// Default export for convenience
export default {
  VERSION,
};
