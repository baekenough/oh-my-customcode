/**
 * oh-my-customcode - Batteries-included agent harness for Claude Code
 *
 * Main library entry point - exports public API
 */

export {
  type AgentConfig,
  getConfigPath,
  getDefaultConfig,
  loadConfig,
  mergeConfig,
  type OmccConfig,
  saveConfig,
} from './core/config.js';
export {
  detectGitWorkflow,
  type GitWorkflowResult,
  type GitWorkflowType,
  getDefaultWorkflow,
  renderGitWorkflowEN,
  renderGitWorkflowKO,
} from './core/git-workflow.js';
// Core modules
export {
  copyTemplates,
  createDirectoryStructure,
  getTemplateManifest,
  type InstallOptions,
  type InstallResult,
  install,
  type TemplateManifest,
} from './core/installer.js';
export {
  getProviderLayout,
  type InstallComponent,
} from './core/layout.js';
export {
  type DetectionConfidence,
  type DetectionSource,
  detectProvider,
  type ProviderDetection,
} from './core/provider.js';
export {
  type AgentVersion,
  applyUpdates,
  checkForUpdates,
  preserveCustomizations,
  type UpdateCheckResult,
  type UpdateOptions,
  type UpdateResult,
  update,
} from './core/updater.js';

// Utilities
export {
  type CopyOptions,
  copyDirectory,
  ensureDirectory,
  fileExists,
  getPackageRoot,
  readJsonFile,
  resolveTemplatePath,
  writeJsonFile,
} from './utils/fs.js';

export {
  createLogger,
  debug,
  error,
  info,
  type LoggerOptions,
  type LogLevel,
  setLocale,
  setLogLevel,
  success,
  warn,
} from './utils/logger.js';

// Version
export const VERSION = '0.0.0';

// Default export for convenience
export default {
  VERSION,
};
